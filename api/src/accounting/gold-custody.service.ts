// api/src/accounting/gold-custody.service.ts
//
// طلای نزد بانک کارگشایی (حساب 1027)
//   • سپردن طلا از خزانه به بانک (وثیقه‌ی تسهیلات یا امانت): بد 1027 / بس 1020
//   • بازگشت طلا از بانک به خزانه (آزادسازی وثیقه):          بد 1020 / بس 1027
// هر دو جهت به «بهای میانگین موزون» حساب مبدأ ثبت می‌شوند تا ریال و گرم با هم جابه‌جا شوند
// و سود/زیانی از جابه‌جایی صرف ایجاد نشود. خود وام (2090) و کارمزد آن (5190) سند دستی‌اند.

import { BadRequestException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingService,
  DecimalInput,
  toDecimal,
} from './accounting.service';
import { ACC } from './accounts.seed';

export type CustodyDirection = 'TO_BANK' | 'FROM_BANK';

export interface CustodyTransferInput {
  direction: CustodyDirection;
  /** وزن به گرم معادل ۷۵۰ (حداکثر ۴ رقم اعشار) */
  grams: string;
  /** تاریخ تحویل/دریافت طلا (YYYY-MM-DD)؛ خالی = اکنون */
  date?: string;
  /** شماره قرارداد/رسید بانک کارگشایی */
  reference?: string;
  description?: string;
}

const REFERENCE_TYPE = 'GOLD_BANK_CUSTODY';
const s = (v: DecimalInput | null | undefined) => toDecimal(v).toString();

@Injectable()
export class GoldCustodyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async summary() {
    const [accounts, price, history, loan] = await Promise.all([
      this.prisma.account.findMany({
        where: { code: { in: [ACC.GOLD_VAULT, ACC.GOLD_AT_BANK] } },
      }),
      this.accounting.currentGoldPriceRial(),
      this.prisma.journalEntry.findMany({
        where: { referenceType: REFERENCE_TYPE },
        orderBy: { entryDate: 'desc' },
        take: 100,
        include: { ledgerEntries: { include: { account: true } } },
      }),
      this.prisma.account.aggregate({
        where: { code: { startsWith: ACC.BANK_LOAN } },
        _sum: { balanceRial: true },
      }),
    ]);
    const row = (code: string) => {
      const a = accounts.find((x) => x.code === code);
      const grams = toDecimal(a?.balanceGrams);
      const book = toDecimal(a?.balanceRial);
      return {
        code,
        name: a?.name ?? code,
        grams: s(grams),
        bookValueRial: s(book),
        averageCostPerGramRial: grams.gt(0)
          ? s(book.div(grams).toDecimalPlaces(0))
          : '0',
        marketValueRial: s(grams.times(price).toDecimalPlaces(0)),
      };
    };
    return {
      pricePerGramRial: s(price),
      vault: row(ACC.GOLD_VAULT),
      atBank: row(ACC.GOLD_AT_BANK),
      loanBalanceRial: s(loan._sum.balanceRial),
      history: history.map((j) => {
        const toBank = j.ledgerEntries.some(
          (l) => l.account.code === ACC.GOLD_AT_BANK && l.side === 'DEBIT',
        );
        const line = j.ledgerEntries.find(
          (l) => l.account.code === ACC.GOLD_AT_BANK,
        );
        return {
          id: j.id,
          referenceNumber: j.referenceNumber,
          entryDate: j.entryDate.toISOString(),
          direction: toBank ? 'TO_BANK' : 'FROM_BANK',
          grams: s(line?.amountGrams),
          costRial: s(line?.amountRial),
          description: j.description,
          reference: j.referenceId,
        };
      }),
    };
  }

  async transfer(adminId: string, input: CustodyTransferInput) {
    if (input.direction !== 'TO_BANK' && input.direction !== 'FROM_BANK') {
      throw new BadRequestException('جهت انتقال نامعتبر است');
    }
    let grams: Decimal;
    try {
      grams = new Decimal(String(input.grams ?? '').trim());
    } catch {
      throw new BadRequestException('وزن نامعتبر است');
    }
    if (!grams.isFinite() || grams.lte(0)) {
      throw new BadRequestException('وزن باید بیشتر از صفر باشد');
    }
    if (grams.decimalPlaces() > 4) {
      throw new BadRequestException('دقت وزن حداکثر ۴ رقم اعشار است');
    }
    let entryDate: Date | undefined;
    if (input.date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
        throw new BadRequestException('قالب تاریخ باید YYYY-MM-DD باشد');
      }
      entryDate = new Date(input.date);
      if (entryDate.getTime() > Date.now()) {
        throw new BadRequestException('تاریخ نمی‌تواند در آینده باشد');
      }
    }
    const toBank = input.direction === 'TO_BANK';
    const from = toBank ? ACC.GOLD_VAULT : ACC.GOLD_AT_BANK;
    const to = toBank ? ACC.GOLD_AT_BANK : ACC.GOLD_VAULT;
    const reference = input.reference?.trim().slice(0, 100) || undefined;

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "accounts" WHERE "code" IN (${ACC.GOLD_VAULT}, ${ACC.GOLD_AT_BANK}) FOR UPDATE`;
        const source = await tx.account.findUnique({ where: { code: from } });
        const available = toDecimal(source?.balanceGrams);
        if (available.lt(grams)) {
          throw new BadRequestException(
            `موجودی ${source?.name ?? from} (${available.toString()} گرم) کمتر از ${grams.toString()} گرم است`,
          );
        }
        const cost = await this.accounting.averageCostRial(tx, from, grams);
        const label = toBank
          ? `سپردن ${grams.toString()} گرم طلای ۷۵۰ از خزانه به بانک کارگشایی`
          : `بازگشت ${grams.toString()} گرم طلای ۷۵۰ از بانک کارگشایی به خزانه`;
        const description = [
          label,
          reference && `رسید/قرارداد ${reference}`,
          input.description?.trim(),
        ]
          .filter(Boolean)
          .join(' — ')
          .slice(0, 500);
        const journal = await this.accounting.postJournal(tx, {
          description,
          totalRial: cost,
          totalGrams: grams,
          source: 'TREASURY',
          referenceType: REFERENCE_TYPE,
          referenceId: reference,
          createdByAdminId: adminId,
          entryDate,
          lines: [
            {
              accountCode: to,
              side: 'DEBIT',
              amountRial: cost,
              amountGrams: grams,
            },
            {
              accountCode: from,
              side: 'CREDIT',
              amountRial: cost,
              amountGrams: grams,
            },
          ],
        });
        return {
          message: toBank
            ? 'سپردن طلا به بانک کارگشایی ثبت شد'
            : 'بازگشت طلا از بانک کارگشایی به خزانه ثبت شد',
          journalEntryId: journal.id,
          costRial: cost.toString(),
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }
}
