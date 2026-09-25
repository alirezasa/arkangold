// api/src/accounting/inventory-accounting.service.ts
//
// بهای تمام‌شده‌ی شمش فروخته‌شده در فروشگاه (و برگشت آن هنگام لغو سفارش):
//   بدهکار 5060 بهای تمام‌شده / بستانکار 1025 موجودی شمش خزانه — به بهای میانگین موزون
// وزن هر ردیف = وزن انتخابی (محصول وزنی) یا وزن تنوع × تعداد؛ فقط محصولات دارای عیار.
// سند با referenceType = SHOP_COGS و referenceId = شناسه‌ی سفارش ثبت می‌شود تا برگشت
// دقیقاً همان بها را خنثی کند.

import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { AccountingService, toDecimal } from './accounting.service';
import { ACC } from './accounts.seed';

type Tx = Prisma.TransactionClient;

@Injectable()
export class InventoryAccountingService {
  constructor(private readonly accounting: AccountingService) {}

  /** وزن کل شمش‌های یک سفارش فروشگاه (گرم فیزیکی) */
  async shopOrderBarGrams(tx: Tx, orderId: string): Promise<Decimal> {
    const items = await tx.shopOrderItem.findMany({
      where: { orderId },
      select: {
        quantity: true,
        selectedWeightGrams: true,
        variant: { select: { weightGrams: true } },
        product: { select: { purityKarat: true } },
      },
    });
    return items.reduce((sum, i) => {
      if (!i.product?.purityKarat) return sum;
      const w = toDecimal(i.selectedWeightGrams ?? i.variant?.weightGrams);
      return sum.plus(w.times(i.quantity));
    }, new Decimal(0));
  }

  async postShopCogs(tx: Tx, orderId: string): Promise<{ id: string } | null> {
    const grams = await this.shopOrderBarGrams(tx, orderId);
    if (grams.lte(0)) return null;
    const existing = await tx.journalEntry.findFirst({
      where: {
        referenceType: 'SHOP_COGS',
        referenceId: orderId,
        reversalOfId: null,
        reversedBy: null,
      },
      select: { id: true },
    });
    if (existing) return existing;
    const cost = await this.accounting.averageCostRial(tx, ACC.BULLION, grams);
    return this.accounting.postJournal(tx, {
      description: `بهای تمام‌شده شمش فروخته‌شده — سفارش فروشگاه ${orderId} — ${grams.toString()} گرم`,
      totalRial: cost,
      totalGrams: grams,
      source: 'INVENTORY',
      referenceType: 'SHOP_COGS',
      referenceId: orderId,
      lines: [
        {
          accountCode: ACC.BAR_COGS,
          side: 'DEBIT',
          amountRial: cost,
          amountGrams: grams,
        },
        {
          accountCode: ACC.BULLION,
          side: 'CREDIT',
          amountRial: cost,
          amountGrams: grams,
        },
      ],
    });
  }

  async reverseShopCogs(tx: Tx, orderId: string): Promise<void> {
    const journal = await tx.journalEntry.findFirst({
      where: {
        referenceType: 'SHOP_COGS',
        referenceId: orderId,
        reversalOfId: null,
        reversedBy: null,
      },
      select: { id: true },
    });
    if (!journal) return;
    await this.accounting.reverseJournal(tx, journal.id, {
      description: `برگشت بهای تمام‌شده شمش — لغو سفارش فروشگاه ${orderId}`,
    });
  }
}
