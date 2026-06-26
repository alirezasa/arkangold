import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PriceService } from './price.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { Decimal } from '../generated/prisma/client/runtime/library';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private prisma: PrismaService,
    private priceService: PriceService,
    private systemConfig: SystemConfigService,
  ) {}

  // ══════════════════════════════════════════
  // ── قفل قیمت (۲ دقیقه) ──
  // ══════════════════════════════════════════
  async lockPrice(userId: string, side: 'BUY' | 'SELL', amountGrams: number) {
    await this.checkUserIdentity(userId);

    if (amountGrams <= 0)
      throw new BadRequestException('مقدار باید بزرگتر از صفر باشد');

    // حداقل مقدار از config
    const minGrams = await this.systemConfig.getNumber(
      'trade.gold.min_grams',
      0.1,
    );
    const maxGrams = await this.systemConfig.getNumber(
      'trade.gold.max_grams',
      1000,
    );

    if (amountGrams < minGrams) {
      throw new BadRequestException(`حداقل مقدار معامله ${minGrams} گرم است`);
    }
    if (amountGrams > maxGrams) {
      throw new BadRequestException(`حداکثر مقدار معامله ${maxGrams} گرم است`);
    }

    const currentPrice = await this.priceService.getCurrentGoldPrice();
    if (!currentPrice)
      throw new BadRequestException(
        'قیمت در دسترس نیست. لطفاً مجدداً تلاش کنید',
      );

    // محاسبه قیمت موثر (خرید کمی بالاتر، فروش کمی پایین‌تر - spread)
    const spreadPercent = await this.systemConfig.getNumber(
      'trade.gold.spread_percent',
      0.3,
    );
    const effectivePrice =
      side === 'BUY'
        ? Math.ceil(currentPrice * (1 + spreadPercent / 100))
        : Math.floor(currentPrice * (1 - spreadPercent / 100));

    const lockDurationSec = await this.systemConfig.getNumber(
      'trade.lock_duration_seconds',
      120,
    );
    const expiresAt = new Date(Date.now() + lockDurationSec * 1000);

    const lock = await this.prisma.priceLock.create({
      data: {
        userId,
        metal: 'GOLD',
        amountGrams: new Decimal(amountGrams),
        side,
        lockedPrice: new Decimal(effectivePrice),
        expiresAt,
        used: false,
      },
    });

    const totalRial = amountGrams * effectivePrice;
    const [feePercent, taxPercent] = await Promise.all([
      this.systemConfig.getNumber(
        side === 'BUY' ? 'fee.buy_gold' : 'fee.sell_gold',
        1.0,
      ),
      this.systemConfig.getNumber(side === 'BUY' ? 'tax.buy' : 'tax.sell', 0),
    ]);
    const feeRial = Math.round((totalRial * feePercent) / 100);
    const taxRial = Math.round((totalRial * taxPercent) / 100);
    const totalPayable =
      side === 'BUY'
        ? totalRial + feeRial + taxRial
        : totalRial - feeRial - taxRial;

    return {
      lockId: lock.id,
      metal: 'GOLD',
      side,
      amountGrams,
      lockedPrice: effectivePrice,
      lockedPriceToman: effectivePrice / 10,
      totalRial,
      totalToman: totalRial / 10,
      feeRial,
      feeToman: feeRial / 10,
      feePercent,
      taxRial,
      taxToman: taxRial / 10,
      totalPayableRial: totalPayable,
      totalPayableToman: totalPayable / 10,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: lockDurationSec,
    };
  }

  // ══════════════════════════════════════════
  // ── ثبت سفارش خرید/فروش ──
  // ══════════════════════════════════════════
  async createOrder(userId: string, lockId: string) {
    await this.checkUserIdentity(userId);

    // ۱. بررسی lock
    const lock = await this.prisma.priceLock.findFirst({
      where: { id: lockId, userId, used: false },
    });
    if (!lock) throw new NotFoundException('قفل قیمت یافت نشد');
    if (lock.expiresAt < new Date()) {
      throw new BadRequestException(
        'زمان قفل قیمت منقضی شده است. لطفاً مجدداً تلاش کنید',
      );
    }

    const amountGrams = Number(lock.amountGrams);
    const pricePerGram = Number(lock.lockedPrice);
    const totalRial = amountGrams * pricePerGram;
    const side = lock.side;

    // ۲. محاسبه کارمزد و مالیات
    const [feePercent, taxPercent] = await Promise.all([
      this.systemConfig.getNumber(
        side === 'BUY' ? 'fee.buy_gold' : 'fee.sell_gold',
        1.0,
      ),
      this.systemConfig.getNumber(side === 'BUY' ? 'tax.buy' : 'tax.sell', 0),
    ]);
    const feeRial = Math.round((totalRial * feePercent) / 100);
    const taxRial = Math.round((totalRial * taxPercent) / 100);

    // ۳. بررسی سقف روزانه/ماهانه
    await this.checkDailyLimit(userId, side, amountGrams);
    await this.checkMonthlyLimit(userId, side, amountGrams);

    // ۴. بررسی موجودی کافی
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    if (side === 'BUY') {
      const totalPayable = totalRial + feeRial + taxRial;
      if (Number(wallet.rialBalance) < totalPayable) {
        throw new BadRequestException(
          `موجودی کافی نیست. نیاز به ${(totalPayable / 10).toLocaleString('fa-IR')} تومان`,
        );
      }
    } else {
      // فروش: موجودی طلا چک کن
      if (Number(wallet.goldBalanceGrams) < amountGrams) {
        throw new BadRequestException(
          `موجودی طلا کافی نیست. موجودی شما: ${Number(wallet.goldBalanceGrams).toFixed(4)} گرم`,
        );
      }
    }

    // ۵. ثبت همه چیز در یک transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // ── ثبت Order ──
      const order = await tx.order.create({
        data: {
          userId,
          lockId: lock.id,
          metal: 'GOLD',
          side,
          amountGrams: new Decimal(amountGrams),
          pricePerGram: new Decimal(pricePerGram),
          totalRial: new Decimal(totalRial),
          fee: new Decimal(feeRial),
          tax: new Decimal(taxRial),
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });

      // ── ثبت تراکنش اصلی ──
      const mainTx = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: side === 'BUY' ? 'BUY_GOLD' : 'SELL_GOLD',
          amountGrams: new Decimal(amountGrams),
          amountRial: new Decimal(totalRial),
          pricePerGram: new Decimal(pricePerGram),
          feeAmount: new Decimal(feeRial),
          taxAmount: new Decimal(taxRial),
          status: 'COMPLETED',
          description: `order:${order.id}`,
        },
      });

      // ── آپدیت wallet ──
      if (side === 'BUY') {
        const totalDeduct = totalRial + feeRial + taxRial;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            rialBalance: {
              decrement: new Decimal(totalDeduct),
            },
            goldBalanceGrams: {
              increment: new Decimal(amountGrams),
            },
          },
        });
      } else {
        const totalReceive = totalRial - feeRial - taxRial;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            goldBalanceGrams: {
              decrement: new Decimal(amountGrams),
            },
            rialBalance: {
              increment: new Decimal(totalReceive),
            },
          },
        });
      }

      // ── mark lock as used ──
      await tx.priceLock.update({
        where: { id: lock.id },
        data: { used: true },
      });

      // ── ثبت تراکنش‌های کارمزد و مالیات ──
      if (feeRial > 0) {
        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'FEE',
            amountRial: new Decimal(feeRial),
            status: 'COMPLETED',
            description: `fee:${order.id}`,
            relatedTransactionId: mainTx.id,
          },
        });
      }
      if (taxRial > 0) {
        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'TAX',
            amountRial: new Decimal(taxRial),
            status: 'COMPLETED',
            description: `tax:${order.id}`,
            relatedTransactionId: mainTx.id,
          },
        });
      }

      return { order, mainTx };
    });

    this.logger.log(
      `[Order] ${side} ${amountGrams}g GOLD @ ${pricePerGram} by ${userId}`,
    );

    // پاسخ نهایی
    const netReceive =
      side === 'SELL' ? (totalRial - feeRial - taxRial) / 10 : 0;

    return {
      orderId: result.order.id,
      transactionId: result.mainTx.id,
      side,
      amountGrams,
      pricePerGram,
      pricePerGramToman: pricePerGram / 10,
      totalRial,
      totalToman: totalRial / 10,
      feeRial,
      feeToman: feeRial / 10,
      taxRial,
      taxToman: taxRial / 10,
      netReceiveToman: netReceive,
      status: 'COMPLETED',
      message:
        side === 'BUY'
          ? `${amountGrams} گرم طلا با موفقیت خریداری شد`
          : `${amountGrams} گرم طلا با موفقیت فروخته شد`,
    };
  }

  // ══════════════════════════════════════════
  // ── تاریخچه سفارشات کاربر ──
  // ══════════════════════════════════════════
  async getUserOrders(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.order.count({ where: { userId } }),
    ]);

    return {
      data: orders.map((o) => ({
        id: o.id,
        side: o.side,
        metal: o.metal,
        amountGrams: Number(o.amountGrams),
        pricePerGramToman: Number(o.pricePerGram) / 10,
        totalToman: Number(o.totalRial) / 10,
        feeToman: Number(o.fee) / 10,
        taxToman: Number(o.tax) / 10,
        status: o.status,
        completedAt: o.completedAt?.toISOString(),
        createdAt: o.createdAt.toISOString(),
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ══════════════════════════════════════════
  // ── helpers ──
  // ══════════════════════════════════════════
  private async checkUserIdentity(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException('برای معامله ابتدا باید احراز هویت کنید');
    }
  }

  private async checkDailyLimit(
    userId: string,
    side: string,
    amountGrams: number,
  ) {
    const limitKey =
      side === 'BUY'
        ? 'trade.gold.daily_buy_limit_grams'
        : 'trade.gold.daily_sell_limit_grams';
    const dailyLimit = await this.systemConfig.getNumber(limitKey, 50);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const type = side === 'BUY' ? 'BUY_GOLD' : 'SELL_GOLD';

    const used = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type,
        status: 'COMPLETED',
        createdAt: { gte: today },
      },
      _sum: { amountGrams: true },
    });
    const usedGrams = Number(used._sum.amountGrams ?? 0);

    if (usedGrams + amountGrams > dailyLimit) {
      const remaining = dailyLimit - usedGrams;
      throw new BadRequestException(
        `سقف ${side === 'BUY' ? 'خرید' : 'فروش'} روزانه ${dailyLimit} گرم است. باقیمانده: ${remaining.toFixed(4)} گرم`,
      );
    }
  }

  private async checkMonthlyLimit(
    userId: string,
    side: string,
    amountGrams: number,
  ) {
    const limitKey =
      side === 'BUY'
        ? 'trade.gold.monthly_buy_limit_grams'
        : 'trade.gold.monthly_sell_limit_grams';
    const monthlyLimit = await this.systemConfig.getNumber(limitKey, 500);
    if (monthlyLimit === 0) return; // بدون محدودیت

    const firstOfMonth = new Date();
    firstOfMonth.setDate(1);
    firstOfMonth.setHours(0, 0, 0, 0);
    const type = side === 'BUY' ? 'BUY_GOLD' : 'SELL_GOLD';

    const used = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type,
        status: 'COMPLETED',
        createdAt: { gte: firstOfMonth },
      },
      _sum: { amountGrams: true },
    });
    const usedGrams = Number(used._sum.amountGrams ?? 0);

    if (usedGrams + amountGrams > monthlyLimit) {
      throw new BadRequestException(
        `سقف ${side === 'BUY' ? 'خرید' : 'فروش'} ماهانه ${monthlyLimit} گرم تجاوز شده است`,
      );
    }
  }
}
