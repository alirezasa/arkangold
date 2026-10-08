import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriceService } from './price.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { Prisma } from '../generated/prisma/client';
import {
  AccountingService,
  LedgerLineInput,
} from '../accounting/accounting.service';
import { businessRuleViolation } from '../common/audit/business-rule.util';
import {
  startOfJalaliMonthTehran,
  startOfTehranDay,
} from '../common/utils/jalali.util';

type Side = 'BUY' | 'SELL';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface OrderLike {
  id: string;
  side: string;
  amountGrams: Prisma.Decimal;
  pricePerGram: Prisma.Decimal;
  totalRial: Prisma.Decimal;
  fee: Prisma.Decimal;
  tax: Prisma.Decimal;
}

interface TradeConfig {
  minGrams: Prisma.Decimal;
  maxGrams: Prisma.Decimal;
  spreadPercent: Prisma.Decimal;
  lockDurationSec: number;
  feePercent: Prisma.Decimal;
  taxPercent: Prisma.Decimal;
  dailyLimit: Prisma.Decimal;
  monthlyLimit: Prisma.Decimal;
  maxPriceAgeSec: number;
  respectSourceDisable: boolean;
}

type PrismaKnownRequestErrorLike = {
  code: string;
  meta?: Record<string, unknown> | null;
};

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceService: PriceService,
    private readonly systemConfig: SystemConfigService,
    private readonly accountingService: AccountingService,
  ) {}

  // ════════════════════════════════════════════════════════
  // قفل قیمت - فقط خواندنی است، تغییری روی موجودی ایجاد نمی‌کند
  // ════════════════════════════════════════════════════════
  async lockPrice(userId: string, side: Side, amountGramsInput: number) {
    await this.assertUserVerified(userId);
    await this.assertServiceEnabled();

    if (!Number.isFinite(amountGramsInput) || amountGramsInput <= 0) {
      throw new BadRequestException('مقدار وارد شده نامعتبر است');
    }
    if (amountGramsInput > 1_000_000) {
      throw new BadRequestException('مقدار وارد شده خارج از محدوده مجاز است');
    }

    // گرد کردن رو به پایین: مقدار قفل‌شده هرگز از مقدار درخواستی (و موجودی) بیشتر نمی‌شود
    const amountGrams = new Prisma.Decimal(amountGramsInput).toDecimalPlaces(
      4,
      Prisma.Decimal.ROUND_DOWN,
    );
    if (amountGrams.lessThanOrEqualTo(0)) {
      throw new BadRequestException('مقدار وارد شده نامعتبر است');
    }

    const cfg = await this.getTradeConfig(side);

    if (amountGrams.lessThan(cfg.minGrams)) {
      throw new BadRequestException(
        `حداقل مقدار معامله ${cfg.minGrams.toString()} گرم است`,
      );
    }
    if (amountGrams.greaterThan(cfg.maxGrams)) {
      throw new BadRequestException(
        `حداکثر مقدار معامله ${cfg.maxGrams.toString()} گرم است`,
      );
    }

    // بررسی زودهنگام سقف روزانه/ماهانه تا کاربر پیش از دیدن پیش‌فاکتور مطلع شود
    // (بررسی قطعی دوباره داخل تراکنش ثبت سفارش و با قفل کیف پول انجام می‌شود)
    await this.assertWithinDailyLimit(this.prisma, userId, side, amountGrams);
    await this.assertWithinMonthlyLimit(this.prisma, userId, side, amountGrams);

    const quote = await this.priceService.getTradableGoldQuote();
    if (!quote || quote.priceRial.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'قیمت لحظه‌ای در دسترس نیست. لطفاً چند لحظه دیگر تلاش کنید',
      );
    }
    // قطعی منبع قیمت: معامله با قیمت کهنه (آربیتراژ روی قیمت قدیمی) ممنوع است
    const priceAgeSec = (Date.now() - quote.fetchedAt.getTime()) / 1000;
    if (priceAgeSec > cfg.maxPriceAgeSec) {
      this.logger.warn(
        `[Price] قفل قیمت رد شد: قیمت ${Math.round(priceAgeSec)} ثانیه قدیمی است`,
      );
      throw new BadRequestException(
        'قیمت بازار در حال به‌روزرسانی است. لطفاً چند لحظه دیگر تلاش کنید',
      );
    }
    if (
      cfg.respectSourceDisable &&
      (side === 'BUY' ? quote.disableBuy : quote.disableSell)
    ) {
      throw new BadRequestException(
        `${side === 'BUY' ? 'خرید' : 'فروش'} طلا در حال حاضر به دلیل بسته بودن بازار امکان‌پذیر نیست`,
      );
    }

    const currentPrice = quote.priceRial;
    const spreadFactor = cfg.spreadPercent.dividedBy(100);
    const effectivePrice =
      side === 'BUY'
        ? currentPrice
            .times(new Prisma.Decimal(1).plus(spreadFactor))
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_UP)
        : currentPrice
            .times(new Prisma.Decimal(1).minus(spreadFactor))
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN);

    if (effectivePrice.lessThanOrEqualTo(0)) {
      this.logger.error(
        `[Price] قیمت موثر نامعتبر محاسبه شد: ${effectivePrice.toString()} (spread=${cfg.spreadPercent.toString()}%)`,
      );
      throw new BadRequestException(
        'خطا در محاسبه قیمت. لطفاً با پشتیبانی تماس بگیرید',
      );
    }

    const { totalRial, feeRial, taxRial, totalPayable } = this.computeAmounts(
      side,
      amountGrams,
      effectivePrice,
      cfg.feePercent,
      cfg.taxPercent,
    );

    if (side === 'SELL' && totalPayable.lessThan(0)) {
      this.logger.error(
        '[Config] کارمزد+مالیات فروش از مبلغ کل بیشتر شده - بررسی فوری system_config لازم است',
      );
      throw new BadRequestException(
        'خطا در محاسبه مبلغ نهایی. لطفاً با پشتیبانی تماس بگیرید',
      );
    }

    const expiresAt = new Date(Date.now() + cfg.lockDurationSec * 1000);

    // کارمزد و مالیات همان لحظه در قفل ذخیره می‌شود تا مبلغ کسرشده دقیقاً
    // با پیش‌فاکتور نمایش داده‌شده یکی باشد (حتی اگر ادمین در این فاصله نرخ را تغییر دهد)
    const lock = await this.prisma.priceLock.create({
      data: {
        userId,
        metal: 'GOLD',
        amountGrams,
        side,
        lockedPrice: effectivePrice,
        feeRial,
        taxRial,
        expiresAt,
        used: false,
      },
    });

    return {
      lockId: lock.id,
      metal: 'GOLD' as const,
      side,
      amountGrams: amountGrams.toString(),
      lockedPriceRial: effectivePrice.toString(),
      lockedPriceToman: effectivePrice.dividedBy(10).toString(),
      totalRial: totalRial.toString(),
      totalToman: totalRial.dividedBy(10).toString(),
      feeRial: feeRial.toString(),
      feeToman: feeRial.dividedBy(10).toString(),
      feePercent: cfg.feePercent.toString(),
      taxRial: taxRial.toString(),
      taxToman: taxRial.dividedBy(10).toString(),
      totalPayableRial: totalPayable.toString(),
      totalPayableToman: totalPayable.dividedBy(10).toString(),
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: cfg.lockDurationSec,
    };
  }

  // ════════════════════════════════════════════════════════
  // اطلاعات معامله برای فرم کاربر: حدود، نرخ‌ها و مصرف سقف روزانه/ماهانه
  // ════════════════════════════════════════════════════════
  async getTradeInfo(userId: string) {
    const [buy, sell, serviceEnabled, quote, wallet] = await Promise.all([
      this.getTradeConfig('BUY'),
      this.getTradeConfig('SELL'),
      this.systemConfig.getBoolean('service.melted_gold.enabled', true),
      this.priceService.getTradableGoldQuote(),
      this.prisma.wallet.findUnique({
        where: { userId },
        select: { id: true },
      }),
    ]);
    const now = new Date();
    const dayStart = startOfTehranDay(now);
    const monthStart = startOfJalaliMonthTehran(now);

    const usedGrams = async (type: 'BUY_GOLD' | 'SELL_GOLD', since: Date) => {
      const r = await this.prisma.transaction.aggregate({
        where: { userId, type, status: 'COMPLETED', createdAt: { gte: since } },
        _sum: { amountGrams: true },
      });
      return r._sum.amountGrams ?? new Prisma.Decimal(0);
    };
    const [buyDay, buyMonth, sellDay, sellMonth] = await Promise.all([
      usedGrams('BUY_GOLD', dayStart),
      usedGrams('BUY_GOLD', monthStart),
      usedGrams('SELL_GOLD', dayStart),
      usedGrams('SELL_GOLD', monthStart),
    ]);

    const priceStale =
      !quote ||
      (now.getTime() - quote.fetchedAt.getTime()) / 1000 > buy.maxPriceAgeSec;

    const sideInfo = (
      cfg: TradeConfig,
      usedDay: Prisma.Decimal,
      usedMonth: Prisma.Decimal,
      sourceDisabled: boolean,
    ) => {
      const remaining = (limit: Prisma.Decimal, used: Prisma.Decimal) =>
        limit.lessThanOrEqualTo(0)
          ? null
          : Prisma.Decimal.max(limit.minus(used), 0).toString();
      return {
        enabled:
          serviceEnabled &&
          !!wallet &&
          !priceStale &&
          !(cfg.respectSourceDisable && sourceDisabled),
        feePercent: cfg.feePercent.toString(),
        taxPercent: cfg.taxPercent.toString(),
        dailyLimitGrams: cfg.dailyLimit.toString(),
        monthlyLimitGrams: cfg.monthlyLimit.toString(),
        usedTodayGrams: usedDay.toString(),
        usedThisMonthGrams: usedMonth.toString(),
        // null = بدون سقف
        remainingTodayGrams: remaining(cfg.dailyLimit, usedDay),
        remainingThisMonthGrams: remaining(cfg.monthlyLimit, usedMonth),
      };
    };

    return {
      serviceEnabled,
      priceAvailable: !priceStale,
      minGrams: buy.minGrams.toString(),
      maxGrams: buy.maxGrams.toString(),
      spreadPercent: buy.spreadPercent.toString(),
      lockDurationSeconds: buy.lockDurationSec,
      buy: sideInfo(buy, buyDay, buyMonth, quote?.disableBuy ?? false),
      sell: sideInfo(sell, sellDay, sellMonth, quote?.disableSell ?? false),
    };
  }

  // ════════════════════════════════════════════════════════
  // ثبت سفارش
  // ════════════════════════════════════════════════════════
  async createOrder(userId: string, lockId: string) {
    await this.assertUserVerified(userId);

    if (!lockId || typeof lockId !== 'string' || !UUID_REGEX.test(lockId)) {
      throw new BadRequestException('شناسه قفل قیمت نامعتبر است');
    }

    const existingCompletedOrder = await this.prisma.order.findFirst({
      where: { lockId, userId, status: 'COMPLETED' },
    });
    if (existingCompletedOrder) {
      return this.buildOrderResponse(existingCompletedOrder, true);
    }

    // غیرفعال شدن خدمت توسط ادمین بین قفل قیمت و تأیید هم باید معامله را متوقف کند
    await this.assertServiceEnabled();

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "price_locks" WHERE "id" = ${lockId}::uuid FOR UPDATE`;

          const lock = await tx.priceLock.findUnique({ where: { id: lockId } });

          if (!lock) throw new NotFoundException('قفل قیمت یافت نشد');
          if (lock.userId !== userId) {
            throw businessRuleViolation(
              new ForbiddenException('این قفل قیمت متعلق به شما نیست'),
              'price_lock.not_owned',
            );
          }

          if (lock.used) {
            const relatedOrder = await tx.order.findFirst({
              where: { lockId: lock.id, userId },
            });
            if (relatedOrder && relatedOrder.status === 'COMPLETED') {
              return this.buildOrderResponse(relatedOrder, true);
            }
            throw businessRuleViolation(
              new BadRequestException(
                'این قفل قیمت قبلاً پردازش شده است. لطفاً مجدداً قیمت را قفل کنید',
              ),
              'price_lock.replay',
            );
          }

          if (lock.metal !== 'GOLD') {
            throw new BadRequestException('این قفل قیمت مربوط به طلا نیست');
          }

          if (lock.expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException(
              'زمان قفل قیمت منقضی شده است. لطفاً مجدداً تلاش کنید',
            );
          }

          const amountGrams = lock.amountGrams;
          const pricePerGram = lock.lockedPrice;
          const side = lock.side;

          // مبالغ دقیقاً همان پیش‌فاکتور قفل‌شده است؛ فقط قفل‌های قدیمی (پیش از ذخیره‌ی
          // کارمزد در قفل) که هر دو مقدار صفر دارند، با نرخ فعلی محاسبه می‌شوند
          let feeRial = lock.feeRial;
          let taxRial = lock.taxRial;
          if (feeRial.isZero() && taxRial.isZero()) {
            const [feePercent, taxPercent] = await Promise.all([
              this.systemConfig.getDecimal(
                side === 'BUY' ? 'fee.buy_gold' : 'fee.sell_gold',
                '1.0',
              ),
              this.systemConfig.getDecimal(
                side === 'BUY' ? 'tax.buy' : 'tax.sell',
                '0',
              ),
            ]);
            ({ feeRial, taxRial } = this.computeAmounts(
              side,
              amountGrams,
              pricePerGram,
              feePercent,
              taxPercent,
            ));
          }
          const totalRial = this.roundRial(amountGrams.times(pricePerGram));
          const totalPayable =
            side === 'BUY'
              ? totalRial.plus(feeRial).plus(taxRial)
              : totalRial.minus(feeRial).minus(taxRial);

          await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

          await this.assertWithinDailyLimit(tx, userId, side, amountGrams);
          await this.assertWithinMonthlyLimit(tx, userId, side, amountGrams);

          // موجودی بلوکه‌شده (برداشت در انتظار، سفارش فروشگاه، تحویل فیزیکی)
          // قابل معامله نیست؛ فقط موجودی آزاد ملاک است
          const holds = await tx.walletHold.aggregate({
            where: { walletId: wallet.id, expiresAt: { gt: new Date() } },
            _sum: { amountRial: true, amountGrams: true },
          });
          const availableRial = wallet.rialBalance.minus(
            holds._sum.amountRial ?? 0,
          );
          const availableGrams = wallet.goldBalanceGrams.minus(
            holds._sum.amountGrams ?? 0,
          );

          if (side === 'BUY') {
            if (availableRial.lessThan(totalPayable)) {
              throw new BadRequestException(
                `موجودی قابل استفاده کافی نیست. مبلغ لازم: ${this.fmtToman(totalPayable)} تومان، موجودی قابل استفاده: ${this.fmtToman(Prisma.Decimal.max(availableRial, 0))} تومان`,
              );
            }
          } else {
            if (availableGrams.lessThan(amountGrams)) {
              throw new BadRequestException(
                `موجودی طلای قابل استفاده کافی نیست. موجودی قابل استفاده: ${Prisma.Decimal.max(availableGrams, 0).toString()} گرم`,
              );
            }
          }

          const order = await tx.order.create({
            data: {
              userId,
              lockId: lock.id,
              metal: 'GOLD',
              side,
              amountGrams,
              pricePerGram,
              totalRial,
              fee: feeRial,
              tax: taxRial,
              status: 'COMPLETED',
              completedAt: new Date(),
            },
          });

          const mainTransaction = await tx.transaction.create({
            data: {
              userId,
              walletId: wallet.id,
              type: side === 'BUY' ? 'BUY_GOLD' : 'SELL_GOLD',
              amountGrams,
              amountRial: totalRial,
              pricePerGram,
              feeAmount: feeRial,
              taxAmount: taxRial,
              status: 'COMPLETED',
              description: `order:${order.id}`,
            },
          });

          if (side === 'BUY') {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: {
                rialBalance: { decrement: totalPayable },
                goldBalanceGrams: { increment: amountGrams },
              },
            });
          } else {
            await tx.wallet.update({
              where: { id: wallet.id },
              data: {
                goldBalanceGrams: { decrement: amountGrams },
                rialBalance: { increment: totalPayable },
              },
            });
          }

          await tx.priceLock.update({
            where: { id: lock.id },
            data: { used: true },
          });

          if (feeRial.greaterThan(0)) {
            await tx.transaction.create({
              data: {
                userId,
                walletId: wallet.id,
                type: 'FEE',
                amountRial: feeRial,
                status: 'COMPLETED',
                description: `fee:${order.id}`,
                relatedTransactionId: mainTransaction.id,
              },
            });
          }

          if (taxRial.greaterThan(0)) {
            await tx.transaction.create({
              data: {
                userId,
                walletId: wallet.id,
                type: 'TAX',
                amountRial: taxRial,
                status: 'COMPLETED',
                description: `tax:${order.id}`,
                relatedTransactionId: mainTransaction.id,
              },
            });
          }

          await this.postDoubleEntryAccounting(tx, {
            side,
            orderId: order.id,
            totalRial,
            amountGrams,
            feeRial,
            taxRial,
          });

          this.logger.log(
            `[Order] ${side} ${amountGrams.toString()}g GOLD @ ${pricePerGram.toString()} توسط ${userId} | orderId=${order.id}`,
          );

          return this.buildOrderResponse(order, false);
        },
        {
          maxWait: 5000,
          timeout: 14000,
        },
      );
    } catch (err) {
      throw this.translateDbError(err, userId, lockId);
    }
  }

  private isPrismaKnownRequestErrorLike(
    err: unknown,
  ): err is PrismaKnownRequestErrorLike {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      typeof (err as { code?: unknown }).code === 'string'
    );
  }

  // ════════════════════════════════════════════════════════
  // ترجمه خطاهای سطح پایین دیتابیس به پیام‌های کاربرپسند فارسی
  // ════════════════════════════════════════════════════════
  private translateDbError(
    err: unknown,
    userId: string,
    lockId: string,
  ): Error {
    if (
      err instanceof BadRequestException ||
      err instanceof NotFoundException ||
      err instanceof ForbiddenException ||
      err instanceof InternalServerErrorException
    ) {
      return err;
    }

    if (this.isPrismaKnownRequestErrorLike(err)) {
      if (err.code === 'P2034') {
        this.logger.warn(
          `[Order] write conflict برای کاربر ${userId} - lockId=${lockId}`,
        );
        return new BadRequestException(
          'سیستم در حال پردازش درخواست مشابه است. لطفاً چند لحظه دیگر دوباره تلاش کنید',
        );
      }

      const postgresCode = err.meta?.code;

      if (typeof postgresCode === 'string' && postgresCode.startsWith('23')) {
        this.logger.error(
          `[ALERT][DB-CONSTRAINT] نقض محدودیت دیتابیس (کد ${postgresCode}) برای کاربر ${userId} - lockId=${lockId}. ` +
            'این نشانه یک باگ منطقی در لایه اپلیکیشن است که باید فوراً بررسی شود!',
        );
        return new BadRequestException(
          'خطا در پردازش تراکنش. لطفاً با پشتیبانی تماس بگیرید',
        );
      }
    }

    this.logger.error(
      `[Order][UNEXPECTED] خطای پیش‌بینی‌نشده برای کاربر ${userId} - lockId=${lockId}:`,
      err instanceof Error ? err.stack : err,
    );

    return new InternalServerErrorException(
      'خطایی در پردازش سفارش رخ داد. لطفاً مجدداً تلاش کنید',
    );
  }

  // ════════════════════════════════════════════════════════
  // ساخت پاسخ یکسان برای سفارش - چه تازه ساخته شده، چه قبلاً موجود بوده
  // ════════════════════════════════════════════════════════
  private buildOrderResponse(order: OrderLike, alreadyExisted: boolean) {
    const side = order.side as Side;
    const netRial =
      side === 'BUY'
        ? order.totalRial.plus(order.fee).plus(order.tax)
        : order.totalRial.minus(order.fee).minus(order.tax);

    return {
      orderId: order.id,
      side,
      amountGrams: order.amountGrams.toString(),
      pricePerGramRial: order.pricePerGram.toString(),
      pricePerGramToman: order.pricePerGram.dividedBy(10).toString(),
      totalRial: order.totalRial.toString(),
      totalToman: order.totalRial.dividedBy(10).toString(),
      feeRial: order.fee.toString(),
      feeToman: order.fee.dividedBy(10).toString(),
      taxRial: order.tax.toString(),
      taxToman: order.tax.dividedBy(10).toString(),
      // مبلغ نهایی پرداخت‌شده (خرید) یا واریزشده به کیف پول (فروش)
      netToman: netRial.dividedBy(10).toString(),
      status: 'COMPLETED' as const,
      alreadyProcessed: alreadyExisted,
      message: alreadyExisted
        ? 'این سفارش قبلاً با موفقیت پردازش شده است'
        : side === 'BUY'
          ? `${order.amountGrams.toString()} گرم طلا با موفقیت خریداری شد`
          : `${order.amountGrams.toString()} گرم طلا با موفقیت فروخته شد`,
    };
  }

  // ════════════════════════════════════════════════════════
  // اسناد حسابداری دوطرفه - متوازن + به‌روزرسانی مانده‌ها
  // ════════════════════════════════════════════════════════
  private async postDoubleEntryAccounting(
    tx: Prisma.TransactionClient,
    params: {
      side: Side;
      orderId: string;
      totalRial: Prisma.Decimal;
      amountGrams: Prisma.Decimal;
      feeRial: Prisma.Decimal;
      taxRial: Prisma.Decimal;
    },
  ) {
    const { side, orderId, totalRial, amountGrams, feeRial, taxRial } = params;

    // ⚠ فروش طلای آب‌شده به کاربر، طلا را از خزانه خارج نمی‌کند: فقط بدهی طلایی به
    // کاربر (2020) ایجاد و مقدار آن در حساب واسط تأمین (1090) به‌عنوان «کسری پوشش»
    // ثبت می‌شود. خرید واقعی معادل آن از بازار در ماژول خزانه (TreasuryOrder) ثبت و
    // همان‌جا 1090 تسویه و 1020 (موجودی واقعی خزانه) افزایش می‌یابد. فروش کاربر
    // برعکس، کسری را کم (یا مازاد ایجاد) می‌کند.
    const CODES = {
      coverage: '1090',
      rialLiability: '2010',
      goldLiability: '2020',
      taxPayable: '2030',
      feeIncome: '4010',
    } as const;

    const description = `${side === 'BUY' ? 'خرید' : 'فروش'} طلا - سفارش ${orderId}`;
    const lines: LedgerLineInput[] = [];

    if (side === 'BUY') {
      const payable = totalRial.plus(feeRial).plus(taxRial);

      lines.push({
        accountCode: CODES.rialLiability,
        side: 'DEBIT',
        amountRial: payable,
      });
      lines.push({
        accountCode: CODES.goldLiability,
        side: 'CREDIT',
        amountRial: totalRial,
        amountGrams,
      });
      lines.push({
        accountCode: CODES.coverage,
        side: 'DEBIT',
        amountGrams,
      });
    } else {
      const receivable = totalRial.minus(feeRial).minus(taxRial);

      lines.push({
        accountCode: CODES.goldLiability,
        side: 'DEBIT',
        amountRial: totalRial,
        amountGrams,
      });
      lines.push({
        accountCode: CODES.rialLiability,
        side: 'CREDIT',
        amountRial: receivable,
      });
      lines.push({
        accountCode: CODES.coverage,
        side: 'CREDIT',
        amountGrams,
      });
    }

    if (feeRial.greaterThan(0)) {
      lines.push({
        accountCode: CODES.feeIncome,
        side: 'CREDIT',
        amountRial: feeRial,
      });
    }

    if (taxRial.greaterThan(0)) {
      lines.push({
        accountCode: CODES.taxPayable,
        side: 'CREDIT',
        amountRial: taxRial,
      });
    }

    await this.accountingService.postJournal(tx, {
      description,
      totalRial,
      totalGrams: amountGrams,
      referenceType: 'ORDER',
      referenceId: orderId,
      lines,
    });
  }

  // ══════════════════════════════
  // تاریخچه سفارشات
  // ══════════════════════════════
  async getUserOrders(userId: string, page = 1, limit = 20) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    const safePage = Math.max(page, 1);
    const skip = (safePage - 1) * safeLimit;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      data: orders.map((o) => ({
        id: o.id,
        side: o.side,
        metal: o.metal,
        amountGrams: o.amountGrams.toString(),
        pricePerGramToman: o.pricePerGram.dividedBy(10).toString(),
        totalToman: o.totalRial.dividedBy(10).toString(),
        feeToman: o.fee.dividedBy(10).toString(),
        taxToman: o.tax.dividedBy(10).toString(),
        status: o.status,
        completedAt: o.completedAt?.toISOString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page: safePage,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  // ════════════════════════════════════════════════════════
  // helpers
  // ════════════════════════════════════════════════════════
  private async getTradeConfig(side: Side): Promise<TradeConfig> {
    const [
      minGrams,
      maxGrams,
      spreadPercent,
      lockDurationSec,
      feePercent,
      taxPercent,
      dailyLimit,
      monthlyLimit,
      maxPriceAgeSec,
      respectSourceDisable,
    ] = await Promise.all([
      this.systemConfig.getDecimal('trade.gold.min_grams', '0.1'),
      this.systemConfig.getDecimal('trade.gold.max_grams', '1000'),
      this.systemConfig.getDecimal('trade.gold.spread_percent', '0'),
      this.systemConfig.getNumber('trade.lock_duration_seconds', 120),
      this.systemConfig.getDecimal(
        side === 'BUY' ? 'fee.buy_gold' : 'fee.sell_gold',
        '1.0',
      ),
      this.systemConfig.getDecimal(
        side === 'BUY' ? 'tax.buy' : 'tax.sell',
        '0',
      ),
      this.systemConfig.getDecimal(
        side === 'BUY'
          ? 'trade.gold.daily_buy_limit_grams'
          : 'trade.gold.daily_sell_limit_grams',
        '50',
      ),
      this.systemConfig.getDecimal(
        side === 'BUY'
          ? 'trade.gold.monthly_buy_limit_grams'
          : 'trade.gold.monthly_sell_limit_grams',
        '500',
      ),
      this.systemConfig.getNumber('trade.gold.max_price_age_seconds', 180),
      this.systemConfig.getBoolean('trade.gold.respect_source_disable', true),
    ]);
    return {
      minGrams,
      maxGrams,
      spreadPercent,
      lockDurationSec: Math.min(Math.max(lockDurationSec, 30), 600),
      feePercent,
      taxPercent,
      dailyLimit,
      monthlyLimit,
      // کمتر از ۶۰ ثانیه با چرخه‌ی ۳۰ ثانیه‌ای دریافت قیمت تداخل دارد
      maxPriceAgeSec: Math.max(maxPriceAgeSec, 60),
      respectSourceDisable,
    };
  }

  /** مبالغ ریالی همگی عدد صحیح‌اند (ستون‌های Decimal(18,0)) */
  private roundRial(v: Prisma.Decimal): Prisma.Decimal {
    return v.toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  }

  private computeAmounts(
    side: Side,
    amountGrams: Prisma.Decimal,
    pricePerGram: Prisma.Decimal,
    feePercent: Prisma.Decimal,
    taxPercent: Prisma.Decimal,
  ) {
    const totalRial = this.roundRial(amountGrams.times(pricePerGram));
    const feeRial = this.roundRial(totalRial.times(feePercent).dividedBy(100));
    const taxRial = this.roundRial(totalRial.times(taxPercent).dividedBy(100));
    const totalPayable =
      side === 'BUY'
        ? totalRial.plus(feeRial).plus(taxRial)
        : totalRial.minus(feeRial).minus(taxRial);
    return { totalRial, feeRial, taxRial, totalPayable };
  }

  private fmtToman(rial: Prisma.Decimal): string {
    return Number(
      rial.dividedBy(10).toDecimalPlaces(0, Prisma.Decimal.ROUND_DOWN),
    ).toLocaleString('en-US');
  }

  /** خدمت «طلای آب‌شده» از پنل ادمین قابل غیرفعال شدن است؛ فقط پنهان کردن صفحه کافی نیست */
  private async assertServiceEnabled() {
    const enabled = await this.systemConfig.getBoolean(
      'service.melted_gold.enabled',
      true,
    );
    if (!enabled) {
      throw new ForbiddenException(
        'خرید و فروش طلای آب‌شده در حال حاضر غیرفعال است',
      );
    }
  }

  private async assertUserVerified(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        status: true,
        identity: { select: { status: true } },
      },
    });

    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.status !== 'ACTIVE') {
      throw new ForbiddenException('حساب کاربری شما فعال نیست');
    }
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException('برای معامله ابتدا باید احراز هویت کنید');
    }
  }

  private async assertWithinDailyLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    side: Side,
    amountGrams: Prisma.Decimal,
  ) {
    const limitKey =
      side === 'BUY'
        ? 'trade.gold.daily_buy_limit_grams'
        : 'trade.gold.daily_sell_limit_grams';
    const dailyLimit = await this.systemConfig.getDecimal(limitKey, '50');
    if (dailyLimit.lessThanOrEqualTo(0)) return;

    // روز معاملاتی به وقت تهران (سرور معمولاً روی UTC است)
    const startOfDay = startOfTehranDay();

    const type = side === 'BUY' ? 'BUY_GOLD' : 'SELL_GOLD';
    const result = await tx.transaction.aggregate({
      where: {
        userId,
        type,
        status: 'COMPLETED',
        createdAt: { gte: startOfDay },
      },
      _sum: { amountGrams: true },
    });

    const used = result._sum.amountGrams ?? new Prisma.Decimal(0);

    if (used.plus(amountGrams).greaterThan(dailyLimit)) {
      const remaining = dailyLimit.minus(used);
      throw new BadRequestException(
        `سقف ${side === 'BUY' ? 'خرید' : 'فروش'} روزانه ${dailyLimit.toString()} گرم است. ` +
          `باقیمانده: ${(remaining.greaterThan(0) ? remaining : new Prisma.Decimal(0)).toString()} گرم`,
      );
    }
  }

  private async assertWithinMonthlyLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    side: Side,
    amountGrams: Prisma.Decimal,
  ) {
    const limitKey =
      side === 'BUY'
        ? 'trade.gold.monthly_buy_limit_grams'
        : 'trade.gold.monthly_sell_limit_grams';
    const monthlyLimit = await this.systemConfig.getDecimal(limitKey, '500');
    if (monthlyLimit.lessThanOrEqualTo(0)) return;

    // ماه شمسی جاری به وقت تهران
    const startOfMonth = startOfJalaliMonthTehran();

    const type = side === 'BUY' ? 'BUY_GOLD' : 'SELL_GOLD';
    const result = await tx.transaction.aggregate({
      where: {
        userId,
        type,
        status: 'COMPLETED',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amountGrams: true },
    });

    const used = result._sum.amountGrams ?? new Prisma.Decimal(0);

    if (used.plus(amountGrams).greaterThan(monthlyLimit)) {
      const remaining = Prisma.Decimal.max(monthlyLimit.minus(used), 0);
      throw new BadRequestException(
        `سقف ${side === 'BUY' ? 'خرید' : 'فروش'} ماهانه ${monthlyLimit.toString()} گرم است. ` +
          `باقیمانده: ${remaining.toString()} گرم`,
      );
    }
  }
}
