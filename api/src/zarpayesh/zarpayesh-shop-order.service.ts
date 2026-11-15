// api/src/zarpayesh/zarpayesh-shop-order.service.ts
//
// «ارسال دارایی» سامانه ناظر (زر پایش، متدهای ۶ تا ۹ مستند ۳.۰.۰.۴) برای سفارش تحویل شمش با طلای
// آب‌شده (shop_orders.funding_source = MELTED_GOLD). فقط وقتی کلید اصلی زر پایش روشن است.
//
//   پرداخت سفارش (کسر طلا از کیف)   → MakeDeliveries با مقدار goldAppliedGrams (میلی‌گرم)
//                                      سامانه ناظر کد تأیید تحویل را مستقیم برای کاربر پیامک می‌کند
//   ارسال (ship)                      → SetDeliveries ۲ (آماده ارسال) و برای غیرحضوری ۳ (ارسال شده)
//   تأیید تحویل با کد مشتری           → SetDeliveries ۱ (تحویل کاربر) با approveCode = همان کد پیامک زر پایش
//                                      (کد تحویل جداگانه‌ی آرکان برای این سفارش‌ها صادر نمی‌شود)
//   لغو سفارش پرداخت‌شده              → SetDeliveries ۴
//
// ثبت پس از پرداخت با Cron (هر دقیقه) انجام می‌شود و ارسال سفارش تا ثبت در سامانه ناظر ممکن نیست؛ مگر
// ادمین با ذکر دلیل «ادامه بدون ثبت» را بزند (SKIPPED — در این حالت روند کد تحویل آرکان مثل قبل است).
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ZarPayeshDelivery } from '../generated/prisma/client';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import {
  CallContext,
  DeliveryRequestResult,
  ZarPayeshClientService,
} from './zarpayesh-client.service';
import { ZarPayeshUsersService } from './zarpayesh-users.service';
import { ZarPayeshError } from './zarpayesh-errors';
import {
  DELIVERY_STATUS,
  DELIVERY_STATUS_FA,
  DUPLICATE_TRACKING_CODES,
  WRONG_APPROVE_CODE_ERRORS,
  normalizeApproveCode,
} from './zarpayesh.constants';

/** وضعیت‌های سفارش که هنوز ارسال نشده‌اند و ثبت خودکار برایشان انجام می‌شود */
const REGISTRABLE_ORDER_STATUSES = ['PAID', 'PROCESSING'] as const;
const LOCK_TTL_SECONDS = 60;
const CRON_LOCK_KEY = 'zarpayesh:shop-order:cron';
/** «وضعیت ارسالی تکراری است» — یعنی همین وضعیت قبلاً ثبت شده */
const DUPLICATE_STATUS = 1034;
/** «امکان تغییر وضعیت دارایی که تحویل مشتری شده است، وجود ندارد» */
const ALREADY_DELIVERED = 1026;
/** «مراحل تحویل کالا رعایت نگردیده است» */
const STEP_ORDER_VIOLATED = 1012;

/** وضعیت ارسال دارایی سفارش برای پنل */
export interface ZarPayeshOrderView {
  enabled: boolean;
  amountMg: number;
  deliveryId: string | null;
  state: string | null;
  srcTrackingNumber: string | null;
  trackingCode: string | null;
  requestedAt: Date | null;
  remoteStatus: number | null;
  remoteStatusLabel: string | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  skippedReason: string | null;
  skippedAt: Date | null;
}

export type ApproveOutcome =
  { kind: 'ok' } | { kind: 'wrong'; message: string };

type OrderRow = {
  id: string;
  userId: string;
  orderNumber: string | null;
  status: string;
  fundingSource: string | null;
  goldAppliedGrams: Prisma.Decimal;
};

@Injectable()
export class ZarPayeshShopOrderService {
  private readonly logger = new Logger(ZarPayeshShopOrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ZarPayeshConfigService,
    private readonly client: ZarPayeshClientService,
    private readonly users: ZarPayeshUsersService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ════════════════════════════ کمکی ════════════════════════════

  private static applies(o: OrderRow | null): o is OrderRow {
    return (
      !!o &&
      o.fundingSource === 'MELTED_GOLD' &&
      o.goldAppliedGrams.greaterThan(0)
    );
  }

  /** مقدار طلای کسرشده از کیف (۴ رقم اعشار گرم) به میلی‌گرم صحیح */
  static amountMg(goldAppliedGrams: Prisma.Decimal): number {
    return goldAppliedGrams
      .times(1000)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP)
      .toNumber();
  }

  private loadOrder(orderId: string): Promise<OrderRow | null> {
    return this.prisma.shopOrder.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        orderNumber: true,
        status: true,
        fundingSource: true,
        goldAppliedGrams: true,
      },
    });
  }

  private rowFor(orderId: string) {
    return this.prisma.zarPayeshDelivery.findUnique({
      where: { shopOrderId: orderId },
    });
  }

  private async nextTrackingNumber(): Promise<bigint> {
    const rows = await this.prisma.$queryRaw<{ v: bigint }[]>`
      SELECT nextval('zarpayesh_src_tracking_seq') AS v`;
    return BigInt(rows[0].v);
  }

  private async withLock<T>(orderId: string, fn: () => Promise<T>): Promise<T> {
    const key = `zarpayesh:shop-order:${orderId}`;
    const got = await this.redis
      .set(key, '1', 'EX', LOCK_TTL_SECONDS, 'NX')
      .catch(() => 'OK');
    if (got !== 'OK') {
      throw new ConflictException(
        'ثبت این سفارش در سامانه ناظر در حال انجام است؛ چند ثانیه دیگر دوباره تلاش کنید',
      );
    }
    try {
      return await fn();
    } finally {
      await this.redis.del(key).catch(() => undefined);
    }
  }

  /** MakeDeliverFollowup؛ هر خطا (ثبت‌نشده یا قطعی) → null */
  private async followupOrNull(
    srcTrackingNumber: bigint,
    ctx: CallContext,
  ): Promise<DeliveryRequestResult | null> {
    try {
      return await this.client.makeDeliverFollowup(srcTrackingNumber, {
        ...ctx,
        srcTrackingNumber,
      });
    } catch {
      return null;
    }
  }

  private static errorFields(err: unknown) {
    const z = err instanceof ZarPayeshError ? err : null;
    return {
      errorCode: z?.logCode ?? 'UNKNOWN_ERROR',
      errorMessage: (err as Error).message?.slice(0, 2000) ?? null,
    };
  }

  private async markRequested(
    rowId: string,
    r: { trackingcode?: number | string | bigint; requestedAt?: string },
  ) {
    const at = r.requestedAt ? new Date(r.requestedAt) : new Date();
    return this.prisma.zarPayeshDelivery.update({
      where: { id: rowId },
      data: {
        state: 'REQUESTED',
        trackingCode: BigInt(r.trackingcode as string),
        requestedAt: Number.isNaN(at.getTime()) ? new Date() : at,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  // ════════════════════════════ ثبت (MakeDeliveries) ════════════════════════════

  /**
   * ثبت ارسال دارایی سفارش در سامانه ناظر (idempotent). نتیجه‌ی نامشخص قبلی با MakeDeliverFollowup
   * تعیین تکلیف می‌شود. در خطا ZarPayeshError پرتاب می‌شود و خطا روی ردیف ثبت می‌ماند.
   */
  async register(
    orderId: string,
    ctx: CallContext,
  ): Promise<ZarPayeshDelivery | null> {
    const order = await this.loadOrder(orderId);
    if (!ZarPayeshShopOrderService.applies(order)) return null;
    return this.withLock(orderId, async () => {
      let row = await this.rowFor(orderId);
      if (row && (row.state === 'REQUESTED' || row.state === 'SKIPPED'))
        return row;
      if (
        !(REGISTRABLE_ORDER_STATUSES as readonly string[]).includes(
          order.status,
        )
      ) {
        // ثبت تازه فقط پیش از ارسال (سفارش لغوشده/ارسال‌شده ثبت نمی‌شود)
        return row;
      }
      const cfg = await this.config.getConfig();
      if (cfg.typeId == null) {
        throw new ZarPayeshError(
          'نوع فلز (typeId) سامانه ناظر تنظیم نشده است',
          'CONFIGURATION',
        );
      }
      const amountMg = ZarPayeshShopOrderService.amountMg(
        order.goldAppliedGrams,
      );
      const callCtx: CallContext = { ...ctx, userId: order.userId };
      const nationalCode = await this.users
        .ensureRegistered(order.userId, callCtx, {
          autoRegister: cfg.autoRegisterUsers,
        })
        .catch(async (err) => {
          if (row) {
            await this.prisma.zarPayeshDelivery.update({
              where: { id: row.id },
              data: {
                state: 'FAILED',
                ...ZarPayeshShopOrderService.errorFields(err),
              },
            });
          }
          throw err;
        });

      if (row?.state === 'REQUESTING') {
        // تلاش قبلی نتیجه‌ی نامشخص داشت: شاید ثبت شده باشد
        try {
          const f = await this.client.makeDeliverFollowup(
            row.srcTrackingNumber,
            {
              ...callCtx,
              srcTrackingNumber: row.srcTrackingNumber,
            },
          );
          if (f?.trackingcode != null) return this.markRequested(row.id, f);
        } catch (err) {
          if (err instanceof ZarPayeshError && err.uncertain) throw err;
          // ثبت نشده → ارسال دوباره با همان شماره
        }
      }

      if (!row) {
        try {
          row = await this.prisma.zarPayeshDelivery.create({
            data: {
              srcTrackingNumber: await this.nextTrackingNumber(),
              userId: order.userId,
              typeId: cfg.typeId,
              amountMg: new Prisma.Decimal(amountMg),
              description: `تحویل شمش — سفارش ${order.orderNumber ?? order.id}`,
              reference: order.orderNumber ?? order.id,
              shopOrderId: order.id,
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            row = await this.rowFor(orderId);
            if (!row) throw err;
          } else {
            throw err;
          }
        }
      }
      return this.submit(row, {
        amountMg,
        nationalCode,
        typeId: cfg.typeId.toString(),
        ctx: callCtx,
      });
    });
  }

  private async submit(
    row: ZarPayeshDelivery,
    p: {
      amountMg: number;
      nationalCode: string;
      typeId: string;
      ctx: CallContext;
    },
  ): Promise<ZarPayeshDelivery> {
    let srcTrackingNumber = row.srcTrackingNumber;
    for (let attempt = 1; ; attempt++) {
      try {
        const r = await this.client.makeDeliveries(
          {
            amount: p.amountMg,
            description: row.description ?? '',
            nationalCode: p.nationalCode,
            typeId: p.typeId,
            srcTrackingNumber,
          },
          { ...p.ctx, srcTrackingNumber },
        );
        return await this.markRequested(row.id, r);
      } catch (err) {
        const z = err instanceof ZarPayeshError ? err : null;
        if (
          z?.code != null &&
          DUPLICATE_TRACKING_CODES.has(z.code) &&
          attempt < 4
        ) {
          // شاید تلاش قبلی با همین شماره ثبت شده باشد
          const f = await this.followupOrNull(srcTrackingNumber, p.ctx);
          if (f?.trackingcode != null) return this.markRequested(row.id, f);
          srcTrackingNumber = await this.nextTrackingNumber();
          await this.prisma.zarPayeshDelivery.update({
            where: { id: row.id },
            data: { srcTrackingNumber },
          });
          continue;
        }
        await this.prisma.zarPayeshDelivery.update({
          where: { id: row.id },
          data: {
            // نتیجه‌ی نامشخص: Cron با MakeDeliverFollowup تعیین تکلیف می‌کند
            state: z?.uncertain ? 'REQUESTING' : 'FAILED',
            ...ZarPayeshShopOrderService.errorFields(err),
          },
        });
        throw err;
      }
    }
  }

  // ════════════════════════════ ارسال ════════════════════════════

  /**
   * پیش از ارسال سفارش فراخوانی می‌شود. خروجی true یعنی کد تحویل این مرسوله approveCode سامانه ناظر است.
   * اگر ثبت در سامانه ناظر لازم است و انجام نمی‌شود، ارسال متوقف می‌شود (ConflictException).
   */
  async prepareShipment(orderId: string, adminId: string): Promise<boolean> {
    const order = await this.loadOrder(orderId);
    if (!ZarPayeshShopOrderService.applies(order)) return false;
    const existing = await this.rowFor(orderId);
    if (existing?.state === 'SKIPPED') return false;
    if (!(await this.config.isTradeReportingEnabled())) return false;
    if (existing?.state === 'REQUESTED') return true;
    if (
      !(REGISTRABLE_ORDER_STATUSES as readonly string[]).includes(order.status)
    ) {
      return false;
    }
    try {
      const row = await this.register(orderId, { trigger: 'ADMIN', adminId });
      return row?.state === 'REQUESTED';
    } catch (err) {
      throw new ConflictException(
        `این سفارش (تحویل طلای آب‌شده) پیش از ارسال باید در سامانه ناظر (زر پایش) ثبت شود و ثبت انجام نشد: ${(err as Error).message}. ` +
          'پس از رفع مشکل دوباره تلاش کنید، یا در بخش «سامانه ناظر» همین سفارش «ادامه بدون ثبت» را با ذکر دلیل بزنید.',
      );
    }
  }

  /** پس از ثبت ارسال: ۲ (آماده ارسال) و برای روش غیرحضوری ۳ (ارسال شده) — خطا مانع ارسال نیست */
  async afterShipped(
    orderId: string,
    methodType: string | null,
    adminId: string,
  ) {
    const row = await this.rowFor(orderId);
    if (row?.state !== 'REQUESTED' || row.trackingCode == null) return;
    const ctx: CallContext = { trigger: 'ADMIN', adminId, userId: row.userId };
    try {
      await this.advance(row, DELIVERY_STATUS.SHIP, ctx);
      if (methodType !== 'PICKUP') {
        const fresh = await this.rowFor(orderId);
        if (fresh) await this.advance(fresh, DELIVERY_STATUS.DELIVERY, ctx);
      }
    } catch (err) {
      this.logger.warn(
        `[ZarPayesh] ثبت وضعیت ارسال سفارش ${orderId} ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  /** ثبت یک وضعیت SetDeliveries؛ «وضعیت تکراری» موفق حساب می‌شود. خطای دیگر پرتاب می‌شود. */
  private async setRemote(
    row: ZarPayeshDelivery,
    status: number,
    ctx: CallContext,
    approveCode?: string,
  ) {
    let actionTime: Date = new Date();
    try {
      const r = await this.client.setDeliveries(
        {
          trackingcode: row.trackingCode.toString(),
          setStatusDeleveries: status,
          approveCode: approveCode ?? 0,
        },
        { ...ctx, srcTrackingNumber: row.srcTrackingNumber },
      );
      const t = r?.actionTime ? new Date(r.actionTime) : null;
      if (t && !Number.isNaN(t.getTime())) actionTime = t;
    } catch (err) {
      const dup =
        err instanceof ZarPayeshError &&
        (err.code === DUPLICATE_STATUS ||
          (status === DELIVERY_STATUS.APPROVE &&
            err.code === ALREADY_DELIVERED));
      if (!dup) {
        await this.prisma.zarPayeshDelivery.update({
          where: { id: row.id },
          data: ZarPayeshShopOrderService.errorFields(err),
        });
        throw err;
      }
    }
    return this.prisma.zarPayeshDelivery.update({
      where: { id: row.id },
      data: {
        remoteStatus: status,
        ...(status === DELIVERY_STATUS.APPROVE
          ? { approvedAt: actionTime }
          : {}),
        ...(status === DELIVERY_STATUS.SHIP ? { shippedAt: actionTime } : {}),
        ...(status === DELIVERY_STATUS.DELIVERY
          ? { deliveredAt: actionTime }
          : {}),
        ...(status === DELIVERY_STATUS.CANCEL
          ? { cancelledAt: actionTime }
          : {}),
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  /** پیشروی تا وضعیت ۲ یا ۳ اگر هنوز ثبت نشده باشد */
  private async advance(
    row: ZarPayeshDelivery,
    target: 2 | 3,
    ctx: CallContext,
  ) {
    const done =
      row.remoteStatus === DELIVERY_STATUS.APPROVE ||
      row.remoteStatus === DELIVERY_STATUS.CANCEL ||
      (target === DELIVERY_STATUS.SHIP && row.remoteStatus != null) ||
      (target === DELIVERY_STATUS.DELIVERY &&
        row.remoteStatus === DELIVERY_STATUS.DELIVERY);
    if (done) return row;
    return this.setRemote(row, target, ctx);
  }

  // ════════════════════════════ تحویل (Approve) ════════════════════════════

  /** آیا کد تحویل این مرسوله را سامانه ناظر صادر کرده است؟ */
  async usesZarPayeshCode(orderId: string): Promise<boolean> {
    const s = await this.prisma.shipping.findFirst({
      where: { shopOrderId: orderId },
      orderBy: { createdAt: 'desc' },
      select: { deliveryCodeSource: true },
    });
    return s?.deliveryCodeSource === 'ZARPAYESH';
  }

  /**
   * تأیید تحویل در سامانه ناظر با کدی که سامانه ناظر برای کاربر پیامک کرده (SetDeliveries ۱).
   * کد نادرست → { kind: 'wrong' }؛ قطعی/خطای دیگر → استثنا (سفارش تحویل‌شده ثبت نمی‌شود).
   */
  async approve(
    orderId: string,
    rawCode: string | undefined,
    ctx: CallContext,
  ): Promise<ApproveOutcome> {
    const row = await this.rowFor(orderId);
    if (row?.state !== 'REQUESTED' || row.trackingCode == null) {
      throw new ConflictException(
        'ارسال این سفارش در سامانه ناظر ثبت نشده است؛ وضعیت را در بخش «سامانه ناظر» سفارش بررسی کنید',
      );
    }
    if (row.remoteStatus === DELIVERY_STATUS.APPROVE) return { kind: 'ok' };
    if (row.remoteStatus === DELIVERY_STATUS.CANCEL) {
      throw new ConflictException('ارسال این سفارش در سامانه ناظر لغو شده است');
    }
    const code = normalizeApproveCode(rawCode);
    if (!code) {
      return {
        kind: 'wrong',
        message:
          'کد تحویلی را که سامانه ناظر (زر پایش) برای مشتری پیامک کرده وارد کنید',
      };
    }
    const callCtx: CallContext = { ...ctx, userId: row.userId };
    try {
      let current = await this.advance(row, DELIVERY_STATUS.SHIP, callCtx);
      try {
        await this.setRemote(current, DELIVERY_STATUS.APPROVE, callCtx, code);
      } catch (err) {
        if (
          err instanceof ZarPayeshError &&
          err.code === STEP_ORDER_VIOLATED &&
          current.remoteStatus !== DELIVERY_STATUS.DELIVERY
        ) {
          current = await this.advance(
            current,
            DELIVERY_STATUS.DELIVERY,
            callCtx,
          );
          await this.setRemote(current, DELIVERY_STATUS.APPROVE, callCtx, code);
        } else {
          throw err;
        }
      }
      return { kind: 'ok' };
    } catch (err) {
      if (err instanceof ZarPayeshError) {
        if (err.code != null && WRONG_APPROVE_CODE_ERRORS.has(err.code)) {
          return { kind: 'wrong', message: 'کد تحویل نادرست است' };
        }
        if (err.uncertain) {
          throw new ServiceUnavailableException(
            'پاسخ سامانه ناظر دریافت نشد و نتیجه‌ی تأیید تحویل نامشخص است؛ چند لحظه بعد با همان کد دوباره ثبت کنید',
          );
        }
        throw new BadRequestException(
          `سامانه ناظر تأیید تحویل را نپذیرفت: ${err.message}`,
        );
      }
      throw err;
    }
  }

  /** تحویل بدون کد (مجوز override): Approve سامانه ناظر بدون کد ممکن نیست → برای پیگیری ثبت می‌شود */
  async noteDeliveredWithoutCode(orderId: string) {
    const row = await this.rowFor(orderId);
    if (
      row?.state !== 'REQUESTED' ||
      row.remoteStatus === DELIVERY_STATUS.APPROVE
    )
      return;
    await this.prisma.zarPayeshDelivery.update({
      where: { id: row.id },
      data: {
        errorCode: 'APPROVE_PENDING',
        errorMessage:
          'تحویل سفارش بدون کد ثبت شد؛ Approve در سامانه ناظر انجام نشده است. با کد پیامک‌شده‌ی زر پایش از تب «ارسال دارایی» ثبت کنید.',
      },
    });
  }

  // ════════════════════════════ لغو ════════════════════════════

  /** لغو سفارش پرداخت‌شده → SetDeliveries ۴ (best effort؛ خطا روی ردیف ثبت می‌ماند) */
  async cancel(orderId: string, adminId?: string) {
    const row = await this.rowFor(orderId);
    if (!row || row.state === 'SKIPPED') return;
    const ctx: CallContext = { trigger: 'ADMIN', adminId, userId: row.userId };
    try {
      let current = row;
      if (current.state === 'REQUESTING') {
        const f = await this.followupOrNull(current.srcTrackingNumber, ctx);
        if (f?.trackingcode == null) {
          await this.prisma.zarPayeshDelivery.update({
            where: { id: current.id },
            data: {
              state: 'FAILED',
              errorCode: 'ORDER_CANCELLED',
              errorMessage: 'سفارش لغو شد؛ ثبت در سامانه ناظر یافت نشد',
            },
          });
          return;
        }
        current = await this.markRequested(current.id, f);
      }
      if (current.state !== 'REQUESTED' || current.trackingCode == null) return;
      if (
        current.remoteStatus === DELIVERY_STATUS.CANCEL ||
        current.remoteStatus === DELIVERY_STATUS.APPROVE
      ) {
        return;
      }
      await this.setRemote(current, DELIVERY_STATUS.CANCEL, ctx);
    } catch (err) {
      this.logger.warn(
        `[ZarPayesh] لغو ارسال سفارش ${orderId} در سامانه ناظر ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  // ════════════════════════════ ادمین ════════════════════════════

  /** ارسال بدون ثبت در سامانه ناظر — فقط پیش از ارسال و وقتی ثبتی انجام نشده */
  async skip(orderId: string, adminId: string, reason: string) {
    const order = await this.loadOrder(orderId);
    if (!order) throw new NotFoundException('سفارش یافت نشد');
    if (!ZarPayeshShopOrderService.applies(order)) {
      throw new BadRequestException('این سفارش تحویل طلای آب‌شده نیست');
    }
    if (
      !(REGISTRABLE_ORDER_STATUSES as readonly string[]).includes(order.status)
    ) {
      throw new ConflictException('فقط پیش از ارسال سفارش ممکن است');
    }
    return this.withLock(orderId, async () => {
      const row = await this.rowFor(orderId);
      if (row?.state === 'REQUESTED') {
        throw new ConflictException(
          'ارسال این سفارش در سامانه ناظر ثبت شده است؛ ادامه بدون ثبت ممکن نیست',
        );
      }
      if (row?.state === 'REQUESTING') {
        throw new ConflictException(
          'نتیجه‌ی ثبت قبلی هنوز نامشخص است؛ ابتدا «ثبت دوباره» را بزنید تا وضعیت روشن شود',
        );
      }
      const data = {
        state: 'SKIPPED',
        skippedReason: reason.trim(),
        skippedByAdminId: adminId,
        skippedAt: new Date(),
      };
      if (row) {
        await this.prisma.zarPayeshDelivery.update({
          where: { id: row.id },
          data,
        });
      } else {
        const cfg = await this.config.getConfig();
        await this.prisma.zarPayeshDelivery.create({
          data: {
            ...data,
            srcTrackingNumber: await this.nextTrackingNumber(),
            userId: order.userId,
            typeId: cfg.typeId ?? 0n,
            amountMg: new Prisma.Decimal(
              ZarPayeshShopOrderService.amountMg(order.goldAppliedGrams),
            ),
            description: `تحویل شمش — سفارش ${order.orderNumber ?? order.id}`,
            reference: order.orderNumber ?? order.id,
            shopOrderId: order.id,
            createdByAdminId: adminId,
          },
        });
      }
      return {
        message:
          'این سفارش بدون ثبت در سامانه ناظر ارسال می‌شود (کد تحویل آرکان برای مشتری پیامک می‌شود)',
      };
    });
  }

  /** وضعیت برای صفحه‌ی سفارش در پنل */
  /** مثل view؛ خطا (مثلاً قطعی پایگاه داده) صفحه‌ی سفارش را از کار نمی‌اندازد */
  async viewOrNull(orderId: string): Promise<ZarPayeshOrderView | null> {
    try {
      return await this.view(orderId);
    } catch {
      return null;
    }
  }

  async view(orderId: string): Promise<ZarPayeshOrderView | null> {
    const order = await this.loadOrder(orderId);
    if (!ZarPayeshShopOrderService.applies(order)) return null;
    const [row, enabled] = await Promise.all([
      this.rowFor(orderId),
      this.config.isTradeReportingEnabled(),
    ]);
    return {
      enabled,
      amountMg: ZarPayeshShopOrderService.amountMg(order.goldAppliedGrams),
      deliveryId: row?.id ?? null,
      state: row?.state ?? null,
      srcTrackingNumber: row?.srcTrackingNumber?.toString() ?? null,
      trackingCode: row?.trackingCode?.toString() ?? null,
      requestedAt: row?.requestedAt ?? null,
      remoteStatus: row?.remoteStatus ?? null,
      remoteStatusLabel:
        row?.remoteStatus != null
          ? (DELIVERY_STATUS_FA[row.remoteStatus] ?? null)
          : null,
      approvedAt: row?.approvedAt ?? null,
      cancelledAt: row?.cancelledAt ?? null,
      errorCode: row?.errorCode ?? null,
      errorMessage: row?.errorMessage ?? null,
      skippedReason: row?.skippedReason ?? null,
      skippedAt: row?.skippedAt ?? null,
    };
  }

  // ════════════════════════════ Cron ════════════════════════════

  /** ثبت خودکار سفارش‌های پرداخت‌شده و تعیین تکلیف نتیجه‌های نامشخص */
  @Cron(CronExpression.EVERY_MINUTE)
  async registerPending() {
    let got: string | null = null;
    try {
      got = await this.redis.set(CRON_LOCK_KEY, '1', 'EX', 55, 'NX');
    } catch {
      return;
    }
    if (got !== 'OK') return;
    try {
      if (!(await this.config.isTradeReportingEnabled())) return;
      const orders = await this.prisma.shopOrder.findMany({
        where: {
          fundingSource: 'MELTED_GOLD',
          goldAppliedGrams: { gt: 0 },
          status: { in: [...REGISTRABLE_ORDER_STATUSES] },
          OR: [
            { zarpayeshDelivery: { is: null } },
            {
              zarpayeshDelivery: {
                is: {
                  state: 'REQUESTING',
                  updatedAt: { lt: new Date(Date.now() - 60_000) },
                },
              },
            },
          ],
        },
        orderBy: { paidAt: 'asc' },
        take: 10,
        select: { id: true },
      });
      for (const o of orders) {
        await this.register(o.id, { trigger: 'CRON' }).catch((err) =>
          this.logger.warn(
            `[ZarPayesh] ثبت ارسال سفارش ${o.id} ناموفق بود: ${(err as Error).message}`,
          ),
        );
      }
    } finally {
      await this.redis.del(CRON_LOCK_KEY).catch(() => undefined);
    }
  }
}
