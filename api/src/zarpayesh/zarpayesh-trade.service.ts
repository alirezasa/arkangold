// api/src/zarpayesh/zarpayesh-trade.service.ts
//
// گزارش معاملات طلای آب‌شده به سامانه ناظر. وقتی کلید اصلی روشن است، ثبت سفارش کاربر
// (TradingService.createOrder) این مسیر را طی می‌کند:
//
//   ۱) prepareOrder (پیش از تراکنش پایگاه داده): ثبت کاربر در صورت نیاز ← Reserve
//      (srcTrackingNumber یکتا از sequence) — اگر Reserve رد شود معامله انجام نمی‌شود.
//   ۲) approveOrder (آخرین گام داخل تراکنش، پس از همه‌ی ثبت‌های داخلی): Approve. اگر رد شود
//      تراکنش داخلی rollback می‌شود؛ اگر نتیجه نامشخص باشد (Timeout) با TxnFollowup بررسی می‌شود.
//   ۳) settle (پس از تراکنش): رزرو تأییدنشده Cancel می‌شود؛ اگر سامانه ناظر تأیید کرده ولی
//      سفارش داخلی ثبت نشده باشد، رکورد «نیازمند بررسی» علامت می‌خورد.
//
// پیگیری خودکار (هر دقیقه) رکوردهای نیمه‌کاره/نامشخص را با TxnFollowup تعیین تکلیف می‌کند.
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ZarPayeshTrade } from '../generated/prisma/client';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import {
  CallContext,
  Long,
  TxnFollowupResult,
  ZarPayeshClientService,
} from './zarpayesh-client.service';
import { ZarPayeshUsersService } from './zarpayesh-users.service';
import { userFacingTradeMessage, ZarPayeshError } from './zarpayesh-errors';
import {
  DUPLICATE_TRACKING_CODES,
  ORDER_TYPE,
  TXN_STATUS,
  TXN_STATUS_FA,
} from './zarpayesh.constants';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

export interface ZarPayeshTradeHandle {
  tradeId: string;
  srcTrackingNumber: bigint;
  reserveCode: bigint;
  orderType: number;
  amountMg: number;
  payType: number;
  userId: string;
  approved: boolean;
}

export interface ReserveParams {
  userId: string;
  side: 'BUY' | 'SELL';
  amountGrams: Prisma.Decimal;
  pricePerGramRial: Prisma.Decimal;
  totalRial: Prisma.Decimal;
  description: string;
  source: 'ORDER' | 'ADMIN_TEST';
  priceLockId?: string | null;
  adminId?: string | null;
  trigger: CallContext['trigger'];
}

/** Approve داخل تراکنش پایگاه داده انجام می‌شود؛ Timeout آن کوتاه‌تر از تنظیم عمومی است */
const APPROVE_TIMEOUT_MS = 10_000;
/** پیگیری خودکار رکوردهای سفارش پس از این مدت (تراکنش داخلی حداکثر ۴۵ ثانیه طول می‌کشد) */
const RECONCILE_AFTER_MS = 2 * 60_000;
const RECONCILE_GIVE_UP_MS = 24 * 3600_000;
const RECONCILE_LOCK_KEY = 'zarpayesh:reconcile:lock';

export function gramsToMg(amountGrams: Prisma.Decimal): number {
  const mg = amountGrams.times(1000);
  if (!mg.isInteger()) {
    throw new BadRequestException(
      'مقدار معامله باید مضربی از یک میلی‌گرم (۰٫۰۰۱ گرم) باشد. لطفاً دوباره قیمت را قفل کنید',
    );
  }
  return mg.toNumber();
}

@Injectable()
export class ZarPayeshTradeService {
  private readonly logger = new Logger(ZarPayeshTradeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ZarPayeshConfigService,
    private readonly client: ZarPayeshClientService,
    private readonly users: ZarPayeshUsersService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  isEnabled() {
    return this.config.isTradeReportingEnabled();
  }

  async nextTrackingNumber(): Promise<bigint> {
    const rows = await this.prisma.$queryRaw<{ v: bigint }[]>`
      SELECT nextval('zarpayesh_src_tracking_seq') AS v`;
    return BigInt(rows[0].v);
  }

  /** پیش‌بررسی محلی هنگام قفل قیمت (بدون فراخوانی سامانه ناظر) تا کاربر زودتر مطلع شود */
  async assertUserReportable(userId: string) {
    try {
      await this.users.buildUser(userId);
    } catch (err) {
      throw new BadRequestException(userFacingTradeMessage(err));
    }
  }

  // ════════════════════════════════════════════════════════
  // جریان سفارش
  // ════════════════════════════════════════════════════════

  /**
   * گام ۱ — Reserve پیش از تراکنش. null یعنی گزارش خاموش است یا قفل قیمت قابل پردازش نیست
   * (خطای دقیق قفل را خودِ تراکنش سفارش می‌دهد).
   */
  async prepareOrder(
    userId: string,
    lockId: string,
  ): Promise<ZarPayeshTradeHandle | null> {
    if (!(await this.isEnabled())) return null;
    const lock = await this.prisma.priceLock.findUnique({
      where: { id: lockId },
    });
    if (
      !lock ||
      lock.userId !== userId ||
      lock.used ||
      lock.metal !== 'GOLD' ||
      lock.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }
    const side = lock.side;
    const totalRial = lock.amountGrams
      .times(lock.lockedPrice)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    return this.reserve({
      userId,
      side,
      amountGrams: lock.amountGrams,
      pricePerGramRial: lock.lockedPrice,
      totalRial,
      description: `${side === 'BUY' ? 'خرید' : 'فروش'} طلای آب‌شده — آرکان گلد`,
      source: 'ORDER',
      priceLockId: lockId,
      trigger: 'SYSTEM',
    });
  }

  /** گام ۲ — Approve (داخل تراکنش سفارش؛ خطا = rollback سفارش داخلی) */
  async approveOrder(handle: ZarPayeshTradeHandle, orderId: string) {
    await this.prisma.zarPayeshTrade.update({
      where: { id: handle.tradeId },
      data: { orderId, rrn: orderId },
    });
    const cfg = await this.config.getConfig();
    try {
      await this.approve(handle, orderId, {
        trigger: 'SYSTEM',
        userId: handle.userId,
        srcTrackingNumber: handle.srcTrackingNumber,
        // قفل ردیف کیف پول در این مدت نگه داشته می‌شود؛ حداکثر ۱۰ ثانیه
        timeoutMs: Math.min(cfg.timeoutMs, APPROVE_TIMEOUT_MS),
      });
    } catch (err) {
      throw new BadRequestException(userFacingTradeMessage(err));
    }
  }

  /** گام ۳ — تعیین تکلیف پس از تراکنش سفارش (هرگز خطا پرتاب نمی‌کند) */
  async settle(handle: ZarPayeshTradeHandle, committed: boolean) {
    try {
      if (handle.approved) {
        if (!committed) {
          await this.prisma.zarPayeshTrade.update({
            where: { id: handle.tradeId },
            data: {
              orderId: null,
              needsReview: true,
              reviewNote:
                'معامله در سامانه ناظر تأیید شد اما ثبت سفارش داخلی ناموفق بود — بررسی و اصلاح دستی لازم است',
            },
          });
          this.logger.error(
            `[ALERT][ZarPayesh] ناهمخوانی: srcTrackingNumber=${handle.srcTrackingNumber} در سامانه ناظر تأیید شد ولی سفارش داخلی rollback شد`,
          );
        }
        return;
      }
      const trade = await this.prisma.zarPayeshTrade.findUnique({
        where: { id: handle.tradeId },
      });
      if (!trade) return;
      if (trade.orderId) {
        // سفارش rollback شد (یا سفارش قبلاً با همین قفل ثبت شده بود و این رزرو اضافه است)
        await this.prisma.zarPayeshTrade.update({
          where: { id: handle.tradeId },
          data: { orderId: null },
        });
      }
      if (trade.status === 'RESERVED') {
        await this.cancelTrade(
          { ...trade, orderId: null },
          { trigger: 'SYSTEM', userId: handle.userId },
        );
      }
    } catch (err) {
      this.logger.error(
        `[ZarPayesh] تعیین تکلیف معامله ${handle.srcTrackingNumber} ناموفق بود — پیگیری خودکار انجام می‌شود: ${(err as Error).message}`,
      );
    }
  }

  // ════════════════════════════════════════════════════════
  // Reserve / Approve / Cancel / Followup
  // ════════════════════════════════════════════════════════

  async reserve(p: ReserveParams): Promise<ZarPayeshTradeHandle> {
    const cfg = await this.config.getConfig();
    if (cfg.typeId == null || cfg.vaultId == null) {
      throw this.asUserError(
        new ZarPayeshError(
          'نوع فلز (typeId) یا خزانه (vaultId) سامانه ناظر تنظیم نشده است',
          'CONFIGURATION',
        ),
        p.source,
      );
    }
    const amountMg = gramsToMg(p.amountGrams);
    const unitPrice =
      cfg.unitPriceBasis === 'MILLIGRAM'
        ? p.pricePerGramRial.dividedBy(1000).toDecimalPlaces(4)
        : p.pricePerGramRial;
    const orderType =
      p.side === 'BUY' ? ORDER_TYPE.USER_BUY : ORDER_TYPE.USER_SELL;
    const payType = p.side === 'BUY' ? cfg.buyPayType : cfg.sellPayType;
    const ctx: CallContext = {
      trigger: p.trigger,
      userId: p.userId,
      adminId: p.adminId ?? null,
    };

    let nationalCode: string;
    try {
      nationalCode = await this.users.ensureRegistered(p.userId, ctx, {
        autoRegister: cfg.autoRegisterUsers,
      });
    } catch (err) {
      throw this.asUserError(err, p.source);
    }

    let srcTrackingNumber = await this.nextTrackingNumber();
    const trade = await this.prisma.zarPayeshTrade.create({
      data: {
        srcTrackingNumber,
        source: p.source,
        userId: p.userId,
        priceLockId: p.priceLockId ?? null,
        orderType,
        typeId: cfg.typeId,
        vaultId: cfg.vaultId,
        amountMg: D(amountMg),
        unitPrice,
        totalPrice: p.totalRial,
        payType,
        description: p.description,
        status: 'RESERVING',
        createdByAdminId: p.adminId ?? null,
      },
    });

    let attempt = 0;
    let reRegistered = false;
    for (;;) {
      attempt += 1;
      try {
        const r = await this.client.reserve(
          {
            srcTrackingNumber,
            typeId: cfg.typeId.toString(),
            amount: amountMg,
            unitPrice: unitPrice.toNumber(),
            totalPrice: p.totalRial.toNumber(),
            vaultId: cfg.vaultId.toString(),
            nationalCode,
            orderType,
            description: p.description,
          },
          { ...ctx, srcTrackingNumber },
        );
        const reserveCode = BigInt(r.reserveCode);
        const expire = r.expireAT ? new Date(r.expireAT) : null;
        await this.prisma.zarPayeshTrade.update({
          where: { id: trade.id },
          data: {
            status: 'RESERVED',
            remoteStatus: TXN_STATUS.RESERVED,
            reserveCode,
            reserveExpireAt:
              expire && !Number.isNaN(expire.getTime()) ? expire : null,
            reservedAt: new Date(),
            errorCode: null,
            errorMessage: null,
          },
        });
        return {
          tradeId: trade.id,
          srcTrackingNumber,
          reserveCode,
          orderType,
          amountMg,
          payType,
          userId: p.userId,
          approved: false,
        };
      } catch (err) {
        const zerr = err instanceof ZarPayeshError ? err : null;
        if (
          zerr?.code != null &&
          DUPLICATE_TRACKING_CODES.has(zerr.code) &&
          attempt < 4
        ) {
          srcTrackingNumber = await this.nextTrackingNumber();
          await this.prisma.zarPayeshTrade.update({
            where: { id: trade.id },
            data: { srcTrackingNumber },
          });
          continue;
        }
        if (zerr?.code === 1007 && attempt < 2) continue;
        if (zerr?.code === 1002 && !reRegistered && cfg.autoRegisterUsers) {
          // در سامانه ناظر یافت نشد ولی محلی «ثبت‌شده» بود → ثبت مجدد و یک تلاش دیگر
          reRegistered = true;
          try {
            await this.users.ensureRegistered(p.userId, ctx, {
              autoRegister: true,
              force: true,
            });
            continue;
          } catch {
            /* خطای اصلی گزارش می‌شود */
          }
        }
        await this.prisma.zarPayeshTrade.update({
          where: { id: trade.id },
          data: {
            // نتیجه‌ی Reserve نامشخص → پیگیری خودکار (اگر رزرو شده بود لغو می‌شود)
            status: zerr?.uncertain ? 'UNKNOWN' : 'FAILED',
            errorCode: zerr?.logCode ?? 'UNKNOWN_ERROR',
            errorMessage: (err as Error).message,
          },
        });
        throw this.asUserError(err, p.source);
      }
    }
  }

  /** Approve با تشخیص نتیجه‌ی نامشخص از طریق TxnFollowup */
  async approve(handle: ZarPayeshTradeHandle, rrn: string, ctx: CallContext) {
    try {
      const r = await this.client.approve(
        {
          reserveCode: handle.reserveCode.toString(),
          orderType: handle.orderType,
          amount: handle.amountMg,
          payType: handle.payType,
          rrn,
        },
        ctx,
      );
      const status = Number(r?.status);
      if (status === TXN_STATUS.APPROVED || status === 201 || status === 200) {
        await this.markApproved(handle, {
          referenceNumber: r.referenceNumber,
          vaultBalance: r.vaultBalance,
        });
        return;
      }
      // وضعیت دیگری برگشت — منبع حقیقت: TxnFollowup
      await this.verifyByFollowup(
        handle,
        ctx,
        r?.message ?? `status=${r?.status}`,
      );
    } catch (err) {
      if (err instanceof ZarPayeshError && err.code === 1047) {
        // «درخواست تکراری — Followup را فراخوانی نمایید»
        await this.verifyByFollowup(handle, ctx, err.message);
        return;
      }
      if (err instanceof ZarPayeshError && err.uncertain) {
        await this.verifyByFollowup(handle, ctx, err.message);
        return;
      }
      await this.prisma.zarPayeshTrade.update({
        where: { id: handle.tradeId },
        data: {
          errorCode:
            err instanceof ZarPayeshError ? err.logCode : 'UNKNOWN_ERROR',
          errorMessage: (err as Error).message,
        },
      });
      throw err;
    }
  }

  private async verifyByFollowup(
    handle: ZarPayeshTradeHandle,
    ctx: CallContext,
    reason: string,
  ) {
    let f: TxnFollowupResult;
    try {
      f = await this.client.txnFollowup(handle.srcTrackingNumber, {
        ...ctx,
        timeoutMs: ctx.timeoutMs ?? APPROVE_TIMEOUT_MS,
      });
    } catch (err) {
      await this.prisma.zarPayeshTrade.update({
        where: { id: handle.tradeId },
        data: {
          status: 'UNKNOWN',
          errorCode:
            err instanceof ZarPayeshError ? err.logCode : 'UNKNOWN_ERROR',
          errorMessage: `نتیجه‌ی Approve نامشخص (${reason}) و Followup ناموفق: ${(err as Error).message}`,
          lastFollowupAt: new Date(),
        },
      });
      throw new ZarPayeshError(
        `نتیجه‌ی تأیید معامله در سامانه ناظر نامشخص است: ${reason}`,
        'TIMEOUT',
      );
    }
    const status = Number(f?.status);
    if (status === TXN_STATUS.APPROVED) {
      await this.markApproved(handle, {
        referenceNumber: f.referenceNumber,
        followup: true,
      });
      return;
    }
    await this.prisma.zarPayeshTrade.update({
      where: { id: handle.tradeId },
      data: {
        remoteStatus: Number.isFinite(status) ? status : null,
        lastFollowupAt: new Date(),
        errorMessage: `Approve تأیید نشد (${reason}) — وضعیت سامانه ناظر: ${TXN_STATUS_FA[status] ?? f?.statusName ?? status}`,
      },
    });
    throw new ZarPayeshError(
      `معامله در سامانه ناظر تأیید نشد: ${reason}`,
      'REJECTED',
    );
  }

  private async markApproved(
    handle: ZarPayeshTradeHandle,
    r: {
      referenceNumber?: Long | null;
      vaultBalance?: number | null;
      followup?: boolean;
    },
  ) {
    handle.approved = true;
    await this.prisma.zarPayeshTrade.update({
      where: { id: handle.tradeId },
      data: {
        status: 'APPROVED',
        remoteStatus: TXN_STATUS.APPROVED,
        approvedAt: new Date(),
        referenceNumber:
          r.referenceNumber != null ? BigInt(r.referenceNumber) : undefined,
        vaultBalance: r.vaultBalance != null ? D(r.vaultBalance) : undefined,
        errorCode: null,
        errorMessage: null,
        ...(r.followup ? { lastFollowupAt: new Date() } : {}),
      },
    });
  }

  /** Cancel رزرو؛ خطاهای «رزرو یافت نشد/منقضی» یعنی رزرو دیگر فعال نیست */
  async cancelTrade(trade: ZarPayeshTrade, ctx: CallContext) {
    if (trade.reserveCode == null) {
      throw new ZarPayeshError('این رکورد کد رزرو ندارد', 'VALIDATION');
    }
    try {
      const r = await this.client.cancel(
        {
          reserveCode: trade.reserveCode.toString(),
          orderType: trade.orderType,
          amount: trade.amountMg.toNumber(),
        },
        { ...ctx, srcTrackingNumber: trade.srcTrackingNumber },
      );
      await this.prisma.zarPayeshTrade.update({
        where: { id: trade.id },
        data: {
          status: 'CANCELLED',
          remoteStatus: TXN_STATUS.CANCELLED,
          cancelledAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      return r;
    } catch (err) {
      const code = err instanceof ZarPayeshError ? err.code : null;
      if (code === 1006 || code === 1017) {
        await this.prisma.zarPayeshTrade.update({
          where: { id: trade.id },
          data: {
            status: 'CANCELLED',
            remoteStatus:
              code === 1017 ? TXN_STATUS.EXPIRED : trade.remoteStatus,
            cancelledAt: new Date(),
            errorCode: String(code),
            errorMessage: (err as Error).message,
          },
        });
        return { status: null, message: (err as Error).message };
      }
      if (code === 1025) {
        // «امکان لغو کردن تراکنشی که سابقاً نهایی شده است وجود ندارد» → در سامانه ناظر تأیید شده
        await this.applyRemoteApproved(trade);
      } else {
        await this.prisma.zarPayeshTrade.update({
          where: { id: trade.id },
          data: {
            status:
              err instanceof ZarPayeshError && err.uncertain
                ? 'UNKNOWN'
                : trade.status,
            errorCode:
              err instanceof ZarPayeshError ? err.logCode : 'UNKNOWN_ERROR',
            errorMessage: (err as Error).message,
          },
        });
      }
      throw err;
    }
  }

  /** پیگیری یک رکورد با TxnFollowup و همگام‌سازی وضعیت */
  async followupTrade(trade: ZarPayeshTrade, ctx: CallContext) {
    let f: TxnFollowupResult;
    try {
      f = await this.client.txnFollowup(trade.srcTrackingNumber, ctx);
    } catch (err) {
      const code = err instanceof ZarPayeshError ? err.code : null;
      if (
        (code === 1006 || code === 1008) &&
        (trade.status === 'RESERVING' || trade.status === 'UNKNOWN') &&
        trade.reserveCode == null
      ) {
        // Reserve هرگز در سامانه ناظر ثبت نشده است
        await this.prisma.zarPayeshTrade.update({
          where: { id: trade.id },
          data: { status: 'FAILED', lastFollowupAt: new Date() },
        });
        return { status: null, note: 'رزرو در سامانه ناظر یافت نشد' };
      }
      await this.prisma.zarPayeshTrade.update({
        where: { id: trade.id },
        data: { lastFollowupAt: new Date() },
      });
      throw err;
    }
    const status = Number(f?.status);
    const base: Prisma.ZarPayeshTradeUpdateInput = {
      remoteStatus: Number.isFinite(status) ? status : null,
      lastFollowupAt: new Date(),
      ...(f?.reservecode != null && trade.reserveCode == null
        ? { reserveCode: BigInt(f.reservecode) }
        : {}),
      ...(f?.referenceNumber
        ? { referenceNumber: BigInt(f.referenceNumber) }
        : {}),
    };
    if (status === TXN_STATUS.APPROVED) {
      await this.prisma.zarPayeshTrade.update({
        where: { id: trade.id },
        data: base,
      });
      await this.applyRemoteApproved(trade);
    } else if (
      status === TXN_STATUS.CANCELLED ||
      status === TXN_STATUS.EXPIRED
    ) {
      await this.prisma.zarPayeshTrade.update({
        where: { id: trade.id },
        data: {
          ...base,
          status: 'CANCELLED',
          cancelledAt: trade.cancelledAt ?? new Date(),
        },
      });
    } else if (status === TXN_STATUS.RESERVED) {
      await this.prisma.zarPayeshTrade.update({
        where: { id: trade.id },
        data: { ...base, status: 'RESERVED' },
      });
    } else {
      await this.prisma.zarPayeshTrade.update({
        where: { id: trade.id },
        data: base,
      });
    }
    return f;
  }

  /** سامانه ناظر تأیید کرده: اگر سفارش داخلی کامل وجود ندارد، نیازمند بررسی است */
  private async applyRemoteApproved(trade: ZarPayeshTrade) {
    const order = trade.orderId
      ? await this.prisma.order.findUnique({
          where: { id: trade.orderId },
          select: { status: true },
        })
      : null;
    const consistent =
      trade.source === 'ADMIN_TEST' || order?.status === 'COMPLETED';
    await this.prisma.zarPayeshTrade.update({
      where: { id: trade.id },
      data: {
        status: 'APPROVED',
        remoteStatus: TXN_STATUS.APPROVED,
        approvedAt: trade.approvedAt ?? new Date(),
        ...(consistent
          ? {}
          : {
              needsReview: true,
              reviewNote:
                'سامانه ناظر این معامله را «تأیید شده» گزارش می‌کند اما سفارش داخلی متناظر ثبت نشده است',
            }),
      },
    });
  }

  // ════════════════════════════════════════════════════════
  // پیگیری خودکار
  // ════════════════════════════════════════════════════════

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcile() {
    let got: string | null = null;
    try {
      got = await this.redis.set(RECONCILE_LOCK_KEY, '1', 'EX', 55, 'NX');
    } catch {
      return;
    }
    if (got !== 'OK') return;
    try {
      const now = Date.now();
      const rows = await this.prisma.zarPayeshTrade.findMany({
        where: {
          status: { in: ['RESERVING', 'RESERVED', 'UNKNOWN'] },
          updatedAt: { lt: new Date(now - RECONCILE_AFTER_MS) },
          OR: [
            { lastFollowupAt: null },
            { lastFollowupAt: { lt: new Date(now - RECONCILE_AFTER_MS) } },
          ],
        },
        orderBy: { createdAt: 'asc' },
        take: 20,
      });
      for (const trade of rows) {
        // رزرو آزمایشی ادمین تا انقضا دست نمی‌خورد (ادمین خودش Approve/Cancel می‌کند)
        if (
          trade.source === 'ADMIN_TEST' &&
          trade.status === 'RESERVED' &&
          (!trade.reserveExpireAt || trade.reserveExpireAt.getTime() > now)
        ) {
          continue;
        }
        const ctx: CallContext = { trigger: 'CRON', userId: trade.userId };
        try {
          if (now - trade.createdAt.getTime() > RECONCILE_GIVE_UP_MS) {
            await this.prisma.zarPayeshTrade.update({
              where: { id: trade.id },
              data: {
                needsReview: true,
                reviewNote:
                  'وضعیت این معامله پس از ۲۴ ساعت پیگیری خودکار مشخص نشد — بررسی دستی لازم است',
                lastFollowupAt: new Date(),
              },
            });
            continue;
          }
          await this.followupTrade(trade, ctx);
          const fresh = await this.prisma.zarPayeshTrade.findUnique({
            where: { id: trade.id },
          });
          // رزرو فعال بدون سفارش داخلی قطعی → لغو
          if (fresh?.status === 'RESERVED' && fresh.reserveCode != null) {
            const order = fresh.orderId
              ? await this.prisma.order.findUnique({
                  where: { id: fresh.orderId },
                  select: { status: true },
                })
              : null;
            if (order?.status !== 'COMPLETED') {
              await this.cancelTrade(fresh, ctx);
            } else {
              await this.prisma.zarPayeshTrade.update({
                where: { id: fresh.id },
                data: {
                  needsReview: true,
                  reviewNote:
                    'سفارش داخلی کامل است ولی معامله در سامانه ناظر هنوز «رزرو» است — Approve دستی لازم است',
                },
              });
            }
          }
        } catch (err) {
          this.logger.warn(
            `[ZarPayesh] پیگیری خودکار ${trade.srcTrackingNumber} ناموفق: ${(err as Error).message}`,
          );
        }
      }
    } finally {
      await this.redis.del(RECONCILE_LOCK_KEY).catch(() => undefined);
    }
  }

  // ════════════════════════════════════════════════════════
  // عملیات دستی پنل
  // ════════════════════════════════════════════════════════

  async getTradeOrThrow(id: string) {
    const t = await this.prisma.zarPayeshTrade.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('رکورد معامله یافت نشد');
    return t;
  }

  /** Approve دستی (رزرو آزمایشی یا رزروی که سفارش داخلی آن کامل است) */
  async manualApprove(id: string, adminId: string, rrn?: string) {
    const t = await this.getTradeOrThrow(id);
    if (t.status !== 'RESERVED' || t.reserveCode == null) {
      throw new BadRequestException('فقط رکورد «رزرو شده» قابل تأیید است');
    }
    if (t.source === 'ORDER') {
      const order = t.orderId
        ? await this.prisma.order.findUnique({ where: { id: t.orderId } })
        : null;
      if (order?.status !== 'COMPLETED') {
        throw new BadRequestException(
          'سفارش داخلی این رزرو کامل نشده است؛ تأیید آن در سامانه ناظر مجاز نیست — آن را لغو کنید',
        );
      }
    }
    const handle: ZarPayeshTradeHandle = {
      tradeId: t.id,
      srcTrackingNumber: t.srcTrackingNumber,
      reserveCode: t.reserveCode,
      orderType: t.orderType,
      amountMg: t.amountMg.toNumber(),
      payType: t.payType ?? 11,
      userId: t.userId,
      approved: false,
    };
    const ref =
      rrn?.trim() || t.rrn || t.orderId || `TEST-${t.srcTrackingNumber}`;
    await this.prisma.zarPayeshTrade.update({
      where: { id: t.id },
      data: { rrn: ref },
    });
    await this.approve(handle, ref, {
      trigger: 'ADMIN',
      adminId,
      userId: t.userId,
      srcTrackingNumber: t.srcTrackingNumber,
    });
    return { message: 'معامله در سامانه ناظر تأیید شد' };
  }

  async manualCancel(id: string, adminId: string) {
    const t = await this.getTradeOrThrow(id);
    if (t.status !== 'RESERVED' && t.status !== 'UNKNOWN') {
      throw new BadRequestException(
        'فقط رکورد «رزرو شده» یا «نامشخص» قابل لغو است',
      );
    }
    const r = await this.cancelTrade(t, {
      trigger: 'ADMIN',
      adminId,
      userId: t.userId,
    });
    return { message: r?.message || 'رزرو در سامانه ناظر لغو شد' };
  }

  async manualFollowup(id: string, adminId: string) {
    const t = await this.getTradeOrThrow(id);
    const f = await this.followupTrade(t, {
      trigger: 'ADMIN',
      adminId,
      userId: t.userId,
    });
    return { message: 'وضعیت از سامانه ناظر دریافت شد', followup: f };
  }

  async markReviewed(id: string, adminId: string, note: string) {
    await this.getTradeOrThrow(id);
    await this.prisma.zarPayeshTrade.update({
      where: { id },
      data: {
        needsReview: false,
        reviewNote: `${note} (بررسی‌شده توسط ادمین ${adminId.slice(0, 8)})`,
      },
    });
    return { message: 'رکورد به‌عنوان بررسی‌شده علامت خورد' };
  }

  /** رزرو آزمایشی از پنل (برای آزمون دقیق پیش از روشن کردن) — بدون اثر روی کیف پول */
  async testReserve(
    adminId: string,
    p: {
      userId: string;
      side: 'BUY' | 'SELL';
      amountGrams: string;
      pricePerGramRial: string;
    },
  ) {
    const amountGrams = D(p.amountGrams);
    const price = D(p.pricePerGramRial);
    if (amountGrams.lte(0) || price.lte(0)) {
      throw new BadRequestException('مقدار و قیمت باید مثبت باشند');
    }
    const handle = await this.reserve({
      userId: p.userId,
      side: p.side,
      amountGrams,
      pricePerGramRial: price,
      totalRial: amountGrams
        .times(price)
        .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP),
      description: 'آزمون اتصال آرکان گلد — Reserve آزمایشی',
      source: 'ADMIN_TEST',
      adminId,
      trigger: 'ADMIN',
    });
    return {
      message:
        'رزرو آزمایشی در سامانه ناظر ثبت شد — اکنون آن را لغو (یا در صورت نیاز تأیید) کنید',
      tradeId: handle.tradeId,
      srcTrackingNumber: handle.srcTrackingNumber.toString(),
      reserveCode: handle.reserveCode.toString(),
    };
  }

  private asUserError(err: unknown, source: 'ORDER' | 'ADMIN_TEST') {
    if (source === 'ADMIN_TEST') {
      return new BadRequestException((err as Error).message);
    }
    this.logger.warn(`[ZarPayesh] معامله رد شد: ${(err as Error).message}`);
    return new BadRequestException(userFacingTradeMessage(err));
  }
}
