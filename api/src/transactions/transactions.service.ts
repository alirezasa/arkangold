import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  TransactionType,
  TransactionStatus,
} from '../generated/prisma/client';
import { GetTransactionsQueryDto } from '@arkan-gold/shared';

// دسته‌بندی بصری تراکنش‌ها - برای انتخاب آیکون/رنگ در فرانت
type TxCategory =
  | 'buy'
  | 'sell'
  | 'deposit'
  | 'withdrawal'
  | 'fee'
  | 'shop'
  | 'physical'
  | 'other';

const TYPE_META: Record<
  TransactionType,
  { title: string; category: TxCategory; sign: 'plus' | 'minus' }
> = {
  BUY_GOLD: { title: 'خرید طلای آبشده', category: 'buy', sign: 'minus' },
  SELL_GOLD: { title: 'فروش طلای آبشده', category: 'sell', sign: 'plus' },
  BUY_SILVER: { title: 'خرید نقره', category: 'buy', sign: 'minus' },
  SELL_SILVER: { title: 'فروش نقره', category: 'sell', sign: 'plus' },
  TRANSFER_IN: { title: 'واریز انتقالی', category: 'deposit', sign: 'plus' },
  TRANSFER_OUT: {
    title: 'برداشت انتقالی',
    category: 'withdrawal',
    sign: 'minus',
  },
  WITHDRAWAL: { title: 'برداشت وجه', category: 'withdrawal', sign: 'minus' },
  DEPOSIT: { title: 'واریز وجه', category: 'deposit', sign: 'plus' },
  FEE: { title: 'کارمزد معامله', category: 'fee', sign: 'minus' },
  TAX: { title: 'مالیات', category: 'fee', sign: 'minus' },
  REFERRAL_REWARD: {
    title: 'پاداش معرفی دوستان',
    category: 'deposit',
    sign: 'plus',
  },
  SALARY: { title: 'واریز حقوق طلایی', category: 'deposit', sign: 'plus' },
  PHYSICAL_DELIVERY: {
    title: 'تحویل فیزیکی طلا',
    category: 'physical',
    sign: 'minus',
  },
  SHOP_PURCHASE: { title: 'خرید از فروشگاه', category: 'shop', sign: 'minus' },
  REFUND: { title: 'بازگشت وجه', category: 'deposit', sign: 'plus' },
  MANUAL_ADJUSTMENT: {
    title: 'تنظیم دستی موجودی توسط ادمین',
    category: 'other',
    sign: 'plus',
  },
};

interface TxRow {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  amountGrams: Prisma.Decimal | null;
  amountRial: Prisma.Decimal | null;
  pricePerGram: Prisma.Decimal | null;
  feeAmount: Prisma.Decimal | null;
  taxAmount: Prisma.Decimal | null;
  description: string | null;
  createdAt: Date;
}

@Injectable()
export class TransactionsService {
  constructor(private prisma: PrismaService) {}

  // ══════════════════════════════════════════
  // ── تاریخچه تراکنش‌ها با فیلتر و صفحه‌بندی ──
  // ══════════════════════════════════════════
  async getUserTransactions(userId: string, query: GetTransactionsQueryDto) {
    const { page, limit, type, status, from, to } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TransactionWhereInput = {
      userId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to
                ? { lte: new Date(new Date(to).setHours(23, 59, 59, 999)) }
                : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: items.map((t) => this.toDto(t)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ── جزئیات یک تراکنش ──
  async getTransactionById(userId: string, id: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id, userId },
    });
    if (!tx) throw new NotFoundException('تراکنش یافت نشد');
    return this.toDto(tx, true);
  }

  // ── خلاصه آماری برای کارت‌های بالای صفحه ──
  async getSummary(userId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [
      monthDeposit,
      monthWithdrawal,
      todayBuyGold,
      todaySellGold,
      totalCount,
    ] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          createdAt: { gte: startOfMonth },
        },
        _sum: { amountRial: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'WITHDRAWAL',
          status: { in: ['PENDING', 'COMPLETED'] },
          createdAt: { gte: startOfMonth },
        },
        _sum: { amountRial: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'BUY_GOLD',
          status: 'COMPLETED',
          createdAt: { gte: startOfDay },
        },
        _sum: { amountGrams: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'SELL_GOLD',
          status: 'COMPLETED',
          createdAt: { gte: startOfDay },
        },
        _sum: { amountGrams: true },
      }),
      this.prisma.transaction.count({ where: { userId } }),
    ]);

    return {
      monthDepositRial: Number(monthDeposit._sum.amountRial ?? 0),
      monthWithdrawalRial: Number(monthWithdrawal._sum.amountRial ?? 0),
      todayBuyGoldGrams: Number(todayBuyGold._sum.amountGrams ?? 0),
      todaySellGoldGrams: Number(todaySellGold._sum.amountGrams ?? 0),
      totalCount,
    };
  }

  // ── تبدیل مدل دیتابیس به شکل نمایشی امن (Decimal → string) ──
  private toDto(t: TxRow, detailed = false) {
    const meta =
      TYPE_META[t.type] ??
      ({ title: t.type, category: 'other', sign: 'minus' } as const);

    return {
      id: t.id,
      type: t.type,
      category: meta.category,
      title: meta.title,
      status: t.status,
      amountGrams: t.amountGrams ? t.amountGrams.toString() : null,
      amountRial: t.amountRial ? t.amountRial.toString() : null,
      amountToman: t.amountRial ? t.amountRial.dividedBy(10).toString() : null,
      pricePerGramToman: t.pricePerGram
        ? t.pricePerGram.dividedBy(10).toString()
        : null,
      feeToman: t.feeAmount ? t.feeAmount.dividedBy(10).toString() : null,
      taxToman: t.taxAmount ? t.taxAmount.dividedBy(10).toString() : null,
      sign: meta.sign,
      createdAt: t.createdAt.toISOString(),
      ...(detailed ? { description: t.description } : {}),
    };
  }
}
