// api/src/market/trading.service.ts
//
// نسخه نهایی - بعد از چند دور بازبینی برای محیط فین‌تک با بار بالا.
//
// نکات کلیدی طراحی:
// [1] ReadCommitted (پیش‌فرض) به‌جای Serializable: چون از SELECT...FOR
//     UPDATE صریح استفاده می‌کنیم، نیازی به Serializable نیست. ترکیب
//     این دو فقط باعث serialization failure غیرضروری زیر بار سنگین
//     می‌شود بدون مزیت اضافه در ایمنی.
// [2] ترتیب ثابت قفل‌گیری: همیشه ابتدا price_locks سپس wallets قفل
//     می‌شود - در تمام مسیرهای کد - تا deadlock رخ ندهد.
// [3] Idempotency واقعی: کلیک دوبار/retry شبکه هرگز خطای گمراه‌کننده
//     نمی‌دهد - نتیجه واقعی قبلی برگردانده می‌شود.
// [4] همه محاسبات با Prisma.Decimal - تبدیل به Number فقط در پاسخ نهایی.
// [5] خطاهای دیتابیس (serialization conflict، نقض constraint) به پیام
//     کاربرپسند فارسی ترجمه می‌شوند - هرگز جزئیات فنی لو نمی‌رود.

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

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceService: PriceService,
    private readonly systemConfig: SystemConfigService,
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
      this.systemConfig.getDecimal('trade.gold.spread_percent', '0.3'),
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

    // ── fast-path idempotency (خارج از تراکنش سنگین) ──
    const existingCompletedOrder = await this.prisma.order.findFirst({
      where: { lockId, userId, status: 'COMPLETED' },
    });
    if (existingCompletedOrder) {
      return this.buildOrderResponse(existingCompletedOrder, true);
    }

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          // گام ۱: قفل priceLock با FOR UPDATE (فقط برای lock گرفتن؛
          // مقدار Decimal واقعی را در ادامه با Prisma Client می‌خوانیم)
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

          // گام ۲: قفل wallet (ترتیب ثابت بعد از priceLock - جلوگیری از deadlock)
          await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "user_id" = ${userId}::uuid FOR UPDATE`;
          const wallet = await tx.wallet.findUnique({ where: { userId } });
          if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

          // گام ۳: چک سقف‌های روزانه/ماهانه (هر دو قفل گرفته شده‌اند)
          await this.assertWithinDailyLimit(tx, userId, side, amountGrams);
          await this.assertWithinMonthlyLimit(tx, userId, side, amountGrams);

          // گام ۴: چک موجودی کافی
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

          // گام ۵: ثبت Order
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

          // گام ۶: ثبت تراکنش اصلی
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

          // گام ۷: آپدیت اتمیک موجودی (increment/decrement سمت DB)
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

          // گام ۸: mark lock به used
          await tx.priceLock.update({
            where: { id: lock.id },
            data: { used: true },
          });

          // گام ۹: تراکنش‌های جداگانه کارمزد/مالیات
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

          // گام ۱۰: اسناد حسابداری دوطرفه
          await this.postDoubleEntryAccounting(tx, {
            side,
            orderId: order.id,
            totalRial,
            amountGrams,
            feeRial,
            taxRial,
          });

          this.logger.log(
            `[Order] ${side} ${amountGrams.toString()}g GOLD @ ${pricePerGram.toString()} ` +
              `توسط ${userId} | orderId=${order.id}`,
          );

          return this.buildOrderResponse(order, false);
        },
        {
          // ReadCommitted (پیش‌فرض) کافی است چون از FOR UPDATE صریح
          // استفاده می‌کنیم؛ Serializable فقط overhead اضافه می‌کرد.
          maxWait: 5000,
          timeout: 10000,
        },
      );
    } catch (err) {
      throw this.translateDbError(err, userId, lockId);
    }
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
      err instanceof ForbiddenException
    ) {
      return err;
    }

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2034') {
        this.logger.warn(
          `[Order] write conflict برای کاربر ${userId} - lockId=${lockId}`,
        );
        return new BadRequestException(
          'سیستم در حال پردازش درخواست مشابه است. لطفاً چند لحظه دیگر دوباره تلاش کنید',
        );
      }
      if (err.code === 'P2010' || err.meta?.code === '23514') {
        this.logger.error(
          `[ALERT][DB-CONSTRAINT] نقض محدودیت دیتابیس برای کاربر ${userId} - lockId=${lockId}. ` +
            `این نشانه یک باگ منطقی در لایه اپلیکیشن است که باید فوراً بررسی شود!`,
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
  // اسناد حسابداری دوطرفه
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

    const accountCodes =
      side === 'BUY'
        ? {
            asset: 'CUSTOMER_GOLD_ASSET',
            liability: 'CUSTOMER_RIAL_LIABILITY',
            income: 'FEE_INCOME',
          }
        : {
            asset: 'CUSTOMER_RIAL_ASSET',
            liability: 'CUSTOMER_GOLD_LIABILITY',
            income: 'FEE_INCOME',
          };

    const [assetAccount, liabilityAccount, incomeAccount] = await Promise.all([
      tx.account.findUnique({ where: { code: accountCodes.asset } }),
      tx.account.findUnique({ where: { code: accountCodes.liability } }),
      tx.account.findUnique({ where: { code: accountCodes.income } }),
    ]);

    if (!assetAccount || !liabilityAccount || !incomeAccount) {
      this.logger.error(
        `[Accounting][ALERT] حساب‌های پایه seed نشده‌اند برای order=${orderId} - ` +
          `سند حسابداری ثبت نشد. این باید فوراً بررسی شود (تراکنش کاربر صحیح است)`,
      );
      return;
    }

    const journalEntry = await tx.journalEntry.create({
      data: {
        description: `${side === 'BUY' ? 'خرید' : 'فروش'} طلا - سفارش ${orderId}`,
        totalRial,
        totalGrams: amountGrams,
      },
    });

    if (side === 'BUY') {
      await tx.ledgerEntry.createMany({
        data: [
          {
            journalEntryId: journalEntry.id,
            accountId: assetAccount.id,
            side: 'DEBIT',
            amountGrams,
          },
          {
            journalEntryId: journalEntry.id,
            accountId: liabilityAccount.id,
            side: 'CREDIT',
            amountRial: totalRial.plus(feeRial).plus(taxRial),
          },
          ...(feeRial.greaterThan(0)
            ? [
                {
                  journalEntryId: journalEntry.id,
                  accountId: incomeAccount.id,
                  side: 'CREDIT' as const,
                  amountRial: feeRial,
                },
              ]
            : []),
        ],
      });
    } else {
      await tx.ledgerEntry.createMany({
        data: [
          {
            journalEntryId: journalEntry.id,
            accountId: liabilityAccount.id,
            side: 'DEBIT',
            amountGrams,
          },
          {
            journalEntryId: journalEntry.id,
            accountId: assetAccount.id,
            side: 'CREDIT',
            amountRial: totalRial.minus(feeRial).minus(taxRial),
          },
          ...(feeRial.greaterThan(0)
            ? [
                {
                  journalEntryId: journalEntry.id,
                  accountId: incomeAccount.id,
                  side: 'CREDIT' as const,
                  amountRial: feeRial,
                },
              ]
            : []),
        ],
      });
    }
  }

  // ════════════════════════════════════════════════════════
  // تاریخچه سفارشات
  // ════════════════════════════════════════════════════════
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
