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

    if (!Number.isFinite(amountGramsInput) || amountGramsInput <= 0) {
      throw new BadRequestException('مقدار وارد شده نامعتبر است');
    }
    if (amountGramsInput > 1_000_000) {
      throw new BadRequestException('مقدار وارد شده خارج از محدوده مجاز است');
    }

    const amountGrams = new Prisma.Decimal(amountGramsInput).toDecimalPlaces(4);
    if (amountGrams.lessThanOrEqualTo(0)) {
      throw new BadRequestException('مقدار وارد شده نامعتبر است');
    }

    const [
      minGrams,
      maxGrams,
      spreadPercent,
      lockDurationSec,
      feePercent,
      taxPercent,
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
    ]);

    if (amountGrams.lessThan(minGrams)) {
      throw new BadRequestException(
        `حداقل مقدار معامله ${minGrams.toString()} گرم است`,
      );
    }
    if (amountGrams.greaterThan(maxGrams)) {
      throw new BadRequestException(
        `حداکثر مقدار معامله ${maxGrams.toString()} گرم است`,
      );
    }

    const safeLockDuration = Math.min(Math.max(lockDurationSec, 30), 600);

    const currentPrice = await this.priceService.getCurrentGoldPriceDecimal();
    if (!currentPrice || currentPrice.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'قیمت لحظه‌ای در دسترس نیست. لطفاً چند لحظه دیگر تلاش کنید',
      );
    }

    const spreadFactor = spreadPercent.dividedBy(100);
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
        `[Price] قیمت موثر نامعتبر محاسبه شد: ${effectivePrice.toString()} (spread=${spreadPercent.toString()}%)`,
      );
      throw new BadRequestException(
        'خطا در محاسبه قیمت. لطفاً با پشتیبانی تماس بگیرید',
      );
    }

    const totalRial = amountGrams.times(effectivePrice);
    const feeRial = totalRial
      .times(feePercent)
      .dividedBy(100)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
    const taxRial = totalRial
      .times(taxPercent)
      .dividedBy(100)
      .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

    const totalPayable =
      side === 'BUY'
        ? totalRial.plus(feeRial).plus(taxRial)
        : totalRial.minus(feeRial).minus(taxRial);

    if (side === 'SELL' && totalPayable.lessThan(0)) {
      this.logger.error(
        '[Config] کارمزد+مالیات فروش از مبلغ کل بیشتر شده - بررسی فوری system_config لازم است',
      );
      throw new BadRequestException(
        'خطا در محاسبه مبلغ نهایی. لطفاً با پشتیبانی تماس بگیرید',
      );
    }

    const expiresAt = new Date(Date.now() + safeLockDuration * 1000);

    const lock = await this.prisma.priceLock.create({
      data: {
        userId,
        metal: 'GOLD',
        amountGrams,
        side,
        lockedPrice: effectivePrice,
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
      feePercent: feePercent.toString(),
      taxRial: taxRial.toString(),
      taxToman: taxRial.dividedBy(10).toString(),
      totalPayableRial: totalPayable.toString(),
      totalPayableToman: totalPayable.dividedBy(10).toString(),
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: safeLockDuration,
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

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM "price_locks" WHERE "id" = ${lockId}::uuid FOR UPDATE`;

          const lock = await tx.priceLock.findUnique({ where: { id: lockId } });

          if (!lock) throw new NotFoundException('قفل قیمت یافت نشد');
          if (lock.userId !== userId) {
            throw new ForbiddenException('این قفل قیمت متعلق به شما نیست');
          }

          if (lock.used) {
            const relatedOrder = await tx.order.findFirst({
              where: { lockId: lock.id, userId },
            });
            if (relatedOrder && relatedOrder.status === 'COMPLETED') {
              return this.buildOrderResponse(relatedOrder, true);
            }
            throw new BadRequestException(
              'این قفل قیمت قبلاً پردازش شده است. لطفاً مجدداً قیمت را قفل کنید',
            );
          }

          if (lock.expiresAt.getTime() <= Date.now()) {
            throw new BadRequestException(
              'زمان قفل قیمت منقضی شده است. لطفاً مجدداً تلاش کنید',
            );
          }

          const amountGrams = lock.amountGrams;
          const pricePerGram = lock.lockedPrice;
          const side = lock.side;
          const totalRial = amountGrams.times(pricePerGram);

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

          const feeRial = totalRial
            .times(feePercent)
            .dividedBy(100)
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
          const taxRial = totalRial
            .times(taxPercent)
            .dividedBy(100)
            .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);

          await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

          await this.assertWithinDailyLimit(tx, userId, side, amountGrams);
          await this.assertWithinMonthlyLimit(tx, userId, side, amountGrams);

          if (side === 'BUY') {
            const totalPayable = totalRial.plus(feeRial).plus(taxRial);
            if (wallet.rialBalance.lessThan(totalPayable)) {
              throw new BadRequestException(
                `موجودی کافی نیست. نیاز به ${totalPayable.dividedBy(10).toString()} تومان`,
              );
            }
          } else {
            if (wallet.goldBalanceGrams.lessThan(amountGrams)) {
              throw new BadRequestException(
                `موجودی طلا کافی نیست. موجودی فعلی: ${wallet.goldBalanceGrams.toString()} گرم`,
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
            const totalDeduct = totalRial.plus(feeRial).plus(taxRial);
            await tx.wallet.update({
              where: { id: wallet.id },
              data: {
                rialBalance: { decrement: totalDeduct },
                goldBalanceGrams: { increment: amountGrams },
              },
            });
          } else {
            const totalReceive = totalRial.minus(feeRial).minus(taxRial);
            await tx.wallet.update({
              where: { id: wallet.id },
              data: {
                goldBalanceGrams: { decrement: amountGrams },
                rialBalance: { increment: totalReceive },
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

    const CODES = {
      bankRial: '1010',
      goldInventory: '1020',
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
        accountCode: CODES.goldInventory,
        side: 'DEBIT',
        amountRial: totalRial,
        amountGrams,
      });
      lines.push({
        accountCode: CODES.bankRial,
        side: 'CREDIT',
        amountRial: totalRial,
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
        accountCode: CODES.goldInventory,
        side: 'CREDIT',
        amountRial: totalRial,
        amountGrams,
      });
      lines.push({
        accountCode: CODES.bankRial,
        side: 'DEBIT',
        amountRial: totalRial,
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

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

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

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

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
      throw new BadRequestException(
        `سقف ${side === 'BUY' ? 'خرید' : 'فروش'} ماهانه شما به پایان رسیده است`,
      );
    }
  }
}
