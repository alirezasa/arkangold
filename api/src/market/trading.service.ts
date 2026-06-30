import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PriceService } from './price.service';
import { SystemConfigService } from '../system-config/system-config.service';

import {
  IdentityStatus,
  MetalType,
  OrderSide,
  OrderStatus,
  TransactionStatus,
  TransactionType,
} from '@arkan-gold/shared';

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly priceService: PriceService,
    private readonly systemConfigService: SystemConfigService,
  ) {}

  async lockPrice(userId: string, side: OrderSide, amountGrams: number) {
    await this.checkUserIdentity(userId);

    if (!Number.isFinite(amountGrams) || amountGrams <= 0) {
      throw new BadRequestException('مقدار طلا نامعتبر است');
    }

    const minGrams = Number(
      await this.systemConfigService.getValue('trade.gold.min_grams', '0.01'),
    );
    const maxGrams = Number(
      await this.systemConfigService.getValue('trade.gold.max_grams', '1000'),
    );

    if (amountGrams < minGrams) {
      throw new BadRequestException(`حداقل مقدار مجاز ${minGrams} گرم است`);
    }

    if (amountGrams > maxGrams) {
      throw new BadRequestException(`حداکثر مقدار مجاز ${maxGrams} گرم است`);
    }

    const validPrice = await this.priceService.getValidTradePrice();
    const marketPrice = Number(validPrice.pricePerGram);

    const buySpreadPercent = Number(
      await this.systemConfigService.getValue(
        'trade.gold.buy_spread_percent',
        '0',
      ),
    );
    const sellSpreadPercent = Number(
      await this.systemConfigService.getValue(
        'trade.gold.sell_spread_percent',
        '0',
      ),
    );

    const effectivePrice =
      side === OrderSide.BUY
        ? Math.ceil(marketPrice * (1 + buySpreadPercent / 100))
        : Math.floor(marketPrice * (1 - sellSpreadPercent / 100));

    const lockDurationSeconds = Number(
      await this.systemConfigService.getValue(
        'trade.lock_duration_seconds',
        '120',
      ),
    );

    const expiresAt = new Date(Date.now() + lockDurationSeconds * 1000);

    const priceLock = await this.prisma.priceLock.create({
      data: {
        userId,
        metal: MetalType.GOLD,
        amountGrams: new Prisma.Decimal(amountGrams),
        side,
        lockedPrice: new Prisma.Decimal(effectivePrice),
        expiresAt,
        used: false,
      },
    });

    const totalRialDecimal = new Prisma.Decimal(amountGrams).mul(
      effectivePrice,
    );

    const feePercent = Number(
      await this.systemConfigService.getValue('trade.gold.fee_percent', '0'),
    );
    const taxPercent = Number(
      await this.systemConfigService.getValue('trade.gold.tax_percent', '0'),
    );

    const feeRialDecimal = totalRialDecimal.mul(feePercent).div(100);
    const taxRialDecimal = feeRialDecimal.mul(taxPercent).div(100);
    const totalPayableDecimal = totalRialDecimal
      .add(feeRialDecimal)
      .add(taxRialDecimal);

    return {
      lockId: priceLock.id,
      metal: priceLock.metal,
      side: priceLock.side,
      amountGrams: Number(priceLock.amountGrams),
      lockedPrice: Number(priceLock.lockedPrice),
      lockedPriceToman: Math.floor(Number(priceLock.lockedPrice) / 10),
      totalRial: Number(totalRialDecimal),
      totalToman: Math.floor(Number(totalRialDecimal) / 10),
      feeRial: Number(feeRialDecimal),
      feeToman: Math.floor(Number(feeRialDecimal) / 10),
      feePercent,
      taxRial: Number(taxRialDecimal),
      taxToman: Math.floor(Number(taxRialDecimal) / 10),
      taxPercent,
      totalPayableRial: Number(totalPayableDecimal),
      totalPayableToman: Math.floor(Number(totalPayableDecimal) / 10),
      expiresAt: priceLock.expiresAt,
      expiresInSeconds: lockDurationSeconds,
    };
  }

  async createOrder(userId: string, lockId: string) {
    await this.checkUserIdentity(userId);

    const feePercent = Number(
      await this.systemConfigService.getValue('trade.gold.fee_percent', '0'),
    );
    const taxPercent = Number(
      await this.systemConfigService.getValue('trade.gold.tax_percent', '0'),
    );

    return this.prisma.$transaction(
      async (tx) => {
        const priceLock = await tx.priceLock.findFirst({
          where: {
            id: lockId,
            userId,
            used: false,
          },
        });

        if (!priceLock) {
          throw new NotFoundException('قفل قیمت معتبر پیدا نشد');
        }

        if (priceLock.expiresAt.getTime() < Date.now()) {
          throw new BadRequestException('قفل قیمت منقضی شده است');
        }

        const amountGrams = new Prisma.Decimal(priceLock.amountGrams);
        const lockedPrice = new Prisma.Decimal(priceLock.lockedPrice);

        const totalRial = amountGrams.mul(lockedPrice);
        const feeRial = totalRial.mul(feePercent).div(100);
        const taxRial = feeRial.mul(taxPercent).div(100);

        const totalPayable =
          priceLock.side === OrderSide.BUY
            ? totalRial.add(feeRial).add(taxRial)
            : totalRial.sub(feeRial).sub(taxRial);

        await this.checkDailyLimit(tx, userId, totalRial);
        await this.checkMonthlyLimit(tx, userId, totalRial);

        const wallet = await tx.wallet.findUnique({
          where: { userId },
        });

        if (!wallet) {
          throw new NotFoundException('کیف پول کاربر پیدا نشد');
        }

        if (priceLock.side === OrderSide.BUY) {
          if (new Prisma.Decimal(wallet.rialBalance).lt(totalPayable)) {
            throw new BadRequestException('موجودی ریالی کافی نیست');
          }
        } else {
          if (new Prisma.Decimal(wallet.goldBalanceGrams).lt(amountGrams)) {
            throw new BadRequestException('موجودی طلای کافی نیست');
          }
        }

        const lockConsumeResult = await tx.priceLock.updateMany({
          where: {
            id: lockId,
            userId,
            used: false,
            expiresAt: { gt: new Date() },
          },
          data: {
            used: true,
          },
        });

        if (lockConsumeResult.count !== 1) {
          throw new BadRequestException(
            'این قفل قیمت قبلاً مصرف شده یا معتبر نیست',
          );
        }

        const order = await tx.order.create({
          data: {
            userId,
            metal: priceLock.metal,
            side: priceLock.side,
            amountGrams,
            pricePerGram: lockedPrice,
            totalRial,
            feeRial,
            taxRial,
            status: OrderStatus.COMPLETED,
            lockId: priceLock.id,
          },
        });

        if (priceLock.side === OrderSide.BUY) {
          await tx.wallet.update({
            where: { userId },
            data: {
              rialBalance: new Prisma.Decimal(wallet.rialBalance).sub(
                totalPayable,
              ),
              goldBalanceGrams: new Prisma.Decimal(wallet.goldBalanceGrams).add(
                amountGrams,
              ),
            },
          });

          await tx.transaction.create({
            data: {
              userId,
              walletId: wallet.id,
              type: TransactionType.BUY_GOLD,
              status: TransactionStatus.COMPLETED,
              amountRial: totalPayable,
              amountGrams,
              description: `خرید ${amountGrams.toString()} گرم طلا`,
              referenceId: order.id,
            },
          });
        } else {
          await tx.wallet.update({
            where: { userId },
            data: {
              rialBalance: new Prisma.Decimal(wallet.rialBalance).add(
                totalPayable,
              ),
              goldBalanceGrams: new Prisma.Decimal(wallet.goldBalanceGrams).sub(
                amountGrams,
              ),
            },
          });

          await tx.transaction.create({
            data: {
              userId,
              walletId: wallet.id,
              type: TransactionType.SELL_GOLD,
              status: TransactionStatus.COMPLETED,
              amountRial: totalPayable,
              amountGrams,
              description: `فروش ${amountGrams.toString()} گرم طلا`,
              referenceId: order.id,
            },
          });
        }

        return {
          orderId: order.id,
          status: order.status,
          side: order.side,
          metal: order.metal,
          amountGrams: Number(order.amountGrams),
          pricePerGram: Number(order.pricePerGram),
          totalRial: Number(order.totalRial),
          feeRial: Number(order.feeRial),
          taxRial: Number(order.taxRial),
          finalSettlementRial: Number(totalPayable),
          createdAt: order.createdAt,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  }

  async getUserOrders(userId: string, page = 1, limit = 20) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.order.count({
        where: { userId },
      }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        side: item.side,
        metal: item.metal,
        status: item.status,
        amountGrams: Number(item.amountGrams),
        pricePerGram: Number(item.pricePerGram),
        totalRial: Number(item.totalRial),
        feeRial: Number(item.feeRial),
        taxRial: Number(item.taxRial),
        createdAt: item.createdAt,
      })),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  private async checkUserIdentity(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        identity: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('کاربر پیدا نشد');
    }

    if (!user.identity || user.identity.status !== IdentityStatus.VERIFIED) {
      throw new ForbiddenException('احراز هویت کاربر کامل نیست');
    }
  }

  private async checkDailyLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    amountRial: Prisma.Decimal,
  ) {
    const dailyLimit = Number(
      await this.systemConfigService.getValue('trade.daily_limit_rial', '0'),
    );

    if (!dailyLimit || dailyLimit <= 0) {
      return;
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const dailyAggregate = await tx.transaction.aggregate({
      where: {
        userId,
        status: TransactionStatus.COMPLETED,
        createdAt: { gte: startOfDay },
      },
      _sum: {
        amountRial: true,
      },
    });

    const usedToday = Number(dailyAggregate._sum.amountRial ?? 0);
    const nextTotal = usedToday + Number(amountRial);

    if (nextTotal > dailyLimit) {
      throw new BadRequestException('سقف مجاز معاملات روزانه رد شده است');
    }
  }

  private async checkMonthlyLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    amountRial: Prisma.Decimal,
  ) {
    const monthlyLimit = Number(
      await this.systemConfigService.getValue('trade.monthly_limit_rial', '0'),
    );

    if (!monthlyLimit || monthlyLimit <= 0) {
      return;
    }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyAggregate = await tx.transaction.aggregate({
      where: {
        userId,
        status: TransactionStatus.COMPLETED,
        createdAt: { gte: startOfMonth },
      },
      _sum: {
        amountRial: true,
      },
    });

    const usedThisMonth = Number(monthlyAggregate._sum.amountRial ?? 0);
    const nextTotal = usedThisMonth + Number(amountRial);

    if (nextTotal > monthlyLimit) {
      throw new BadRequestException('سقف مجاز معاملات ماهانه رد شده است');
    }
  }
}
