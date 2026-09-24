// api/src/transactions/transactions-admin.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { summarizeShopItems } from './transactions.service';
import {
  Prisma,
  TransactionType,
  TransactionStatus,
} from '../generated/prisma/client';

interface AdminListQuery {
  page?: number;
  limit?: number;
  userId?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  hasDiscount?: boolean;
}

@Injectable()
export class TransactionsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminListQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 30), 100);

    const where: Prisma.TransactionWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.hasDiscount ? { shopOrder: { discountRial: { gt: 0 } } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          user: {
            select: {
              phone: true,
            },
          },
          shopOrder: {
            select: {
              subtotalRial: true,
              discountRial: true,
              discountCodeText: true,
              items: {
                select: {
                  quantity: true,
                  product: { select: { name: true } },
                  variant: { select: { product: { select: { name: true } } } },
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: items.map((transaction) => ({
        id: transaction.id,
        type: transaction.type,
        status: transaction.status,
        userPhone: transaction.user.phone,

        amountGrams:
          transaction.amountGrams === null
            ? null
            : String(transaction.amountGrams),

        amountToman:
          transaction.amountRial === null
            ? null
            : String(Number(transaction.amountRial) / 10),

        description: transaction.description,
        shopOrderId: transaction.shopOrderId,
        itemsSummary: transaction.shopOrder
          ? summarizeShopItems(transaction.shopOrder.items)
          : null,
        ...this.discountInfo(transaction.shopOrder),
        createdAt: transaction.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** اطلاعات کد تخفیف سفارش فروشگاهِ مرتبط با تراکنش (خرید یا بازگشت وجه) */
  private discountInfo(
    order: {
      subtotalRial: Prisma.Decimal;
      discountRial: Prisma.Decimal;
      discountCodeText: string | null;
    } | null,
  ) {
    if (!order || order.discountRial.lte(0)) {
      return { discountToman: null, discountCode: null, subtotalToman: null };
    }
    return {
      discountToman: order.discountRial.dividedBy(10).toString(),
      discountCode: order.discountCodeText,
      subtotalToman: order.subtotalRial.dividedBy(10).toString(),
    };
  }
}
