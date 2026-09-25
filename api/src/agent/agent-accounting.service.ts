// api/src/agent/agent-accounting.service.ts
//
// تنها نقطه‌ی ثبت اثر مالی عملیات نمایندگان:
//   ۱) سند دوطرفه در دفتر کل (AccountingService.postJournal)
//   ۲) ردیف دفتر معین نماینده (AgentLedgerEntry) + به‌روزرسانی مانده‌ی بدهی نماینده
// هر دو همیشه داخل همان تراکنش عملیات اصلی اجرا می‌شوند تا دفتر کل، دفتر معین
// و وضعیت شمش هرگز از هم جدا نشوند.
//
// نقشه‌ی حساب‌ها:
//   1020 موجودی طلای فیزیکی (گرم)        1030 موجودی شمش امانی نزد نمایندگان (گرم)
//   1010 موجودی نقد                       1040 دریافتنی از نمایندگان
//   4040 درآمد فروش شمش (نمایندگی)        4050 درآمد اجرت/حق ضرب شمش
//   4060 درآمد متفرقه نمایندگان           5040 هزینه حق‌العمل نمایندگان
//   5050 بهای تمام‌شده شمش فروخته‌شده (گرم)

import { Injectable, NotFoundException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import {
  AccountingService,
  LedgerLineInput,
} from '../accounting/accounting.service';

type Tx = Prisma.TransactionClient;

export const AGENT_ACCOUNTS = {
  CASH: '1010',
  VAULT_GOLD: '1020',
  CONSIGNMENT: '1030',
  RECEIVABLE: '1040',
  BAR_SALE_INCOME: '4040',
  PREMIUM_INCOME: '4050',
  OTHER_INCOME: '4060',
  COMMISSION_EXPENSE: '5040',
  BAR_COGS: '5050',
} as const;

export interface AgentLedgerInput {
  agentId: string;
  type: 'SALE' | 'SALE_VOID' | 'SETTLEMENT' | 'ADJUSTMENT';
  debitRial?: Decimal;
  creditRial?: Decimal;
  description: string;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  journalEntryId?: string | null;
  createdByAdminId?: string | null;
}

export interface SaleJournalInput {
  agentTag: string;
  saleNumber: string;
  hologramCode: string;
  weightGrams: Decimal;
  goldValueRial: Decimal;
  premiumRial: Decimal;
  commissionRial: Decimal;
  netPayableRial: Decimal;
}

/** برچسب یکتای نماینده در شرح اسناد — جست‌وجوی اسناد هر نماینده بر اساس همین است */
export const agentTag = (code: string) => `[${code}]`;

const d = (v: Decimal.Value | Prisma.Decimal | null | undefined) =>
  new Decimal(v == null ? 0 : v.toString());

@Injectable()
export class AgentAccountingService {
  constructor(private readonly accounting: AccountingService) {}

  // ═══════════════════════════════════════════
  // دفتر معین نماینده
  // ═══════════════════════════════════════════

  /**
   * ثبت ردیف صورتحساب و اعمال اثر آن بر مانده‌ی نماینده (با قفل ردیف نماینده).
   * بدهکار = افزایش بدهی نماینده به شرکت؛ بستانکار = کاهش آن.
   */
  async postLedger(tx: Tx, input: AgentLedgerInput) {
    await tx.$executeRaw`SELECT 1 FROM "agents" WHERE "id" = ${input.agentId}::uuid FOR UPDATE`;
    const agent = await tx.agent.findUnique({
      where: { id: input.agentId },
      select: { balanceRial: true },
    });
    if (!agent) throw new NotFoundException('نماینده یافت نشد');

    const debit = input.debitRial ?? new Decimal(0);
    const credit = input.creditRial ?? new Decimal(0);
    const balanceAfter = d(agent.balanceRial).plus(debit).minus(credit);

    await tx.agent.update({
      where: { id: input.agentId },
      data: { balanceRial: balanceAfter.toFixed(0) },
    });

    return tx.agentLedgerEntry.create({
      data: {
        agentId: input.agentId,
        type: input.type,
        debitRial: debit.toFixed(0),
        creditRial: credit.toFixed(0),
        balanceAfterRial: balanceAfter.toFixed(0),
        description: input.description,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceNumber: input.referenceNumber,
        journalEntryId: input.journalEntryId ?? null,
        createdByAdminId: input.createdByAdminId ?? null,
      },
    });
  }

  // ═══════════════════════════════════════════
  // اسناد دفتر کل
  // ═══════════════════════════════════════════

  /** تحویل امانی (خزانه → نماینده) یا عودت (نماینده → خزانه) — فقط اثر وزنی */
  async journalStockMovement(
    tx: Tx,
    params: {
      agentTag: string;
      agentName: string;
      voucherNumber: string;
      totalGrams: Decimal;
      count: number;
      direction: 'ALLOCATION' | 'RETURN';
    },
  ) {
    const toAgent = params.direction === 'ALLOCATION';
    return this.accounting.postJournal(tx, {
      description: `${toAgent ? 'تحویل امانی' : 'عودت'} ${params.count} شمش ${
        toAgent ? 'به' : 'از'
      } نماینده «${params.agentName}» ${params.agentTag} — حواله ${params.voucherNumber}`,
      totalRial: 0,
      totalGrams: params.totalGrams,
      lines: [
        {
          accountCode: toAgent
            ? AGENT_ACCOUNTS.CONSIGNMENT
            : AGENT_ACCOUNTS.VAULT_GOLD,
          side: 'DEBIT',
          amountGrams: params.totalGrams,
        },
        {
          accountCode: toAgent
            ? AGENT_ACCOUNTS.VAULT_GOLD
            : AGENT_ACCOUNTS.CONSIGNMENT,
          side: 'CREDIT',
          amountGrams: params.totalGrams,
        },
      ],
    });
  }

  /**
   * فروش شمش توسط نماینده:
   *   بدهکار  1040 دریافتنی از نماینده     = مبلغ فروش − حق‌العمل
   *   بدهکار  5040 هزینه حق‌العمل نماینده   = حق‌العمل
   *   بستانکار 4040 درآمد فروش شمش          = ارزش طلا
   *   بستانکار 4050 درآمد اجرت/حق ضرب       = اجرت
   *   بدهکار  5050 بهای تمام‌شده (گرم) / بستانکار 1030 موجودی امانی (گرم)
   * با reversed=true همان سند با جهت معکوس (ابطال فروش) ثبت می‌شود.
   */
  async journalSale(tx: Tx, input: SaleJournalInput, reversed = false) {
    const dr: 'DEBIT' | 'CREDIT' = reversed ? 'CREDIT' : 'DEBIT';
    const cr: 'DEBIT' | 'CREDIT' = reversed ? 'DEBIT' : 'CREDIT';
    const lines: LedgerLineInput[] = [];

    if (input.netPayableRial.greaterThan(0)) {
      lines.push({
        accountCode: AGENT_ACCOUNTS.RECEIVABLE,
        side: dr,
        amountRial: input.netPayableRial,
      });
    }
    if (input.commissionRial.greaterThan(0)) {
      lines.push({
        accountCode: AGENT_ACCOUNTS.COMMISSION_EXPENSE,
        side: dr,
        amountRial: input.commissionRial,
      });
    }
    lines.push({
      accountCode: AGENT_ACCOUNTS.BAR_SALE_INCOME,
      side: cr,
      amountRial: input.goldValueRial,
    });
    if (input.premiumRial.greaterThan(0)) {
      lines.push({
        accountCode: AGENT_ACCOUNTS.PREMIUM_INCOME,
        side: cr,
        amountRial: input.premiumRial,
      });
    }
    lines.push(
      {
        accountCode: AGENT_ACCOUNTS.BAR_COGS,
        side: dr,
        amountGrams: input.weightGrams,
      },
      {
        accountCode: AGENT_ACCOUNTS.CONSIGNMENT,
        side: cr,
        amountGrams: input.weightGrams,
      },
    );

    return this.accounting.postJournal(tx, {
      description: `${reversed ? 'ابطال فروش' : 'فروش'} شمش توسط نماینده ${
        input.agentTag
      } — ${input.saleNumber} — کد هولوگرام ${input.hologramCode}`,
      totalRial: input.goldValueRial.plus(input.premiumRial),
      totalGrams: input.weightGrams,
      lines,
    });
  }

  /** تسویه‌ی نقدی نماینده: بدهکار 1010 موجودی نقد / بستانکار 1040 دریافتنی */
  async journalSettlement(
    tx: Tx,
    params: {
      agentTag: string;
      settlementNumber: string;
      amountRial: Decimal;
      methodLabel: string;
    },
  ) {
    return this.accounting.postJournal(tx, {
      description: `تسویه نماینده ${params.agentTag} — ${params.settlementNumber} (${params.methodLabel})`,
      totalRial: params.amountRial,
      totalGrams: 0,
      lines: [
        {
          accountCode: AGENT_ACCOUNTS.CASH,
          side: 'DEBIT',
          amountRial: params.amountRial,
        },
        {
          accountCode: AGENT_ACCOUNTS.RECEIVABLE,
          side: 'CREDIT',
          amountRial: params.amountRial,
        },
      ],
    });
  }

  /**
   * اصلاحیه حساب نماینده:
   *   افزایش بدهی (جریمه/کسری): بدهکار 1040 / بستانکار 4060
   *   کاهش بدهی (پاداش/اصلاح کمیسیون): بدهکار 5040 / بستانکار 1040
   */
  async journalAdjustment(
    tx: Tx,
    params: {
      agentTag: string;
      number: string;
      amountRial: Decimal;
      direction: 'INCREASE' | 'DECREASE';
      reason: string;
    },
  ) {
    const increase = params.direction === 'INCREASE';
    return this.accounting.postJournal(tx, {
      description: `اصلاحیه حساب نماینده ${params.agentTag} — ${params.number}: ${params.reason}`,
      totalRial: params.amountRial,
      totalGrams: 0,
      lines: increase
        ? [
            {
              accountCode: AGENT_ACCOUNTS.RECEIVABLE,
              side: 'DEBIT',
              amountRial: params.amountRial,
            },
            {
              accountCode: AGENT_ACCOUNTS.OTHER_INCOME,
              side: 'CREDIT',
              amountRial: params.amountRial,
            },
          ]
        : [
            {
              accountCode: AGENT_ACCOUNTS.COMMISSION_EXPENSE,
              side: 'DEBIT',
              amountRial: params.amountRial,
            },
            {
              accountCode: AGENT_ACCOUNTS.RECEIVABLE,
              side: 'CREDIT',
              amountRial: params.amountRial,
            },
          ],
    });
  }
}
