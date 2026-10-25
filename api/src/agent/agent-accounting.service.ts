// api/src/agent/agent-accounting.service.ts
//
// تنها نقطه‌ی ثبت اثر مالی عملیات نمایندگان:
//   ۱) سند دوطرفه در دفتر کل (AccountingService.postJournal)
//   ۲) ردیف دفتر معین نماینده (AgentLedgerEntry) + به‌روزرسانی مانده‌ی بدهی نماینده
// هر دو همیشه داخل همان تراکنش عملیات اصلی اجرا می‌شوند تا دفتر کل، دفتر معین
// و وضعیت شمش هرگز از هم جدا نشوند.
//
// نقشه‌ی حساب‌ها:
//   1025 موجودی شمش خزانه (گرم)           1030 موجودی شمش امانی نزد نمایندگان (گرم)
//   1010 موجودی نقد                       1040 دریافتنی از نمایندگان
//   4040 درآمد فروش شمش (نمایندگی)        4050 درآمد اجرت/حق ضرب شمش
//   4060 درآمد متفرقه نمایندگان           5040 هزینه حق‌العمل نمایندگان
//   5050 بهای تمام‌شده شمش فروخته‌شده (گرم + ریال به بهای میانگین موزون)
//   2070 بدهی ریالی به نمایندگان (کیف پول) 2080 پیش‌دریافت سفارش‌های خرید نمایندگان
//
// خرید و فروش قطعی (مدل جدید):
//   واریز به کیف پول        بد 1010 / بس 2070
//   پرداخت سفارش از کیف پول  بد 2070 / بس 2080
//   تأیید سفارش و حواله      بد 2080 (یا 1040 در خرید اعتباری) / بس 4040 + 4050 ؛ بد 5050 / بس 1025
//   لغو سفارش پرداخت‌شده     بد 2080 / بس 2070
//   خرید شمش از نماینده      بد 1025 (گرم + ریال) / بس 2070 (کیف پول) یا 1010 (بانک) + بس 1095 (گرم)
//   برداشت از کیف پول        بد 2070 / بس 1010
//   تسویه بدهی از کیف پول     بد 2070 / بس 1040

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
  VAULT_BULLION: '1025',
  CONSIGNMENT: '1030',
  RECEIVABLE: '1040',
  BAR_SALE_INCOME: '4040',
  PREMIUM_INCOME: '4050',
  OTHER_INCOME: '4060',
  COMMISSION_EXPENSE: '5040',
  BAR_COGS: '5050',
  AGENT_WALLET: '2070',
  ORDER_ADVANCE: '2080',
  BULLION_CLEARING: '1095',
} as const;

export interface AgentLedgerInput {
  agentId: string;
  type: 'SALE' | 'SALE_VOID' | 'SETTLEMENT' | 'ADJUSTMENT' | 'PURCHASE';
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
  /** فقط برای ابطال: سند فروش اصلی تا دقیقاً همان بهای تمام‌شده برگردد */
  originalJournalId?: string | null;
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

  /**
   * تحویل امانی (خزانه → نماینده) یا عودت (نماینده → خزانه): وزن و بهای تمام‌شده
   * (میانگین موزون حساب مبدأ) بین 1025 و 1030 جابه‌جا می‌شود.
   */
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
    const costRial = await this.accounting.averageCostRial(
      tx,
      toAgent ? AGENT_ACCOUNTS.VAULT_BULLION : AGENT_ACCOUNTS.CONSIGNMENT,
      params.totalGrams,
    );
    return this.accounting.postJournal(tx, {
      description: `${toAgent ? 'تحویل امانی' : 'عودت'} ${params.count} شمش ${
        toAgent ? 'به' : 'از'
      } نماینده «${params.agentName}» ${params.agentTag} — حواله ${params.voucherNumber}`,
      totalRial: costRial,
      totalGrams: params.totalGrams,
      source: 'INVENTORY',
      referenceType: 'AGENT_VOUCHER',
      referenceId: params.voucherNumber,
      lines: [
        {
          accountCode: toAgent
            ? AGENT_ACCOUNTS.CONSIGNMENT
            : AGENT_ACCOUNTS.VAULT_BULLION,
          side: 'DEBIT',
          amountRial: costRial,
          amountGrams: params.totalGrams,
        },
        {
          accountCode: toAgent
            ? AGENT_ACCOUNTS.VAULT_BULLION
            : AGENT_ACCOUNTS.CONSIGNMENT,
          side: 'CREDIT',
          amountRial: costRial,
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
    const costRial = reversed
      ? await this.costFromJournal(tx, input.originalJournalId)
      : await this.accounting.averageCostRial(
          tx,
          AGENT_ACCOUNTS.CONSIGNMENT,
          input.weightGrams,
        );

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
        amountRial: costRial,
        amountGrams: input.weightGrams,
      },
      {
        accountCode: AGENT_ACCOUNTS.CONSIGNMENT,
        side: cr,
        amountRial: costRial,
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

  /** بهای تمام‌شده‌ی ثبت‌شده در سطر 5050 سند فروش اصلی (برای ابطال) */
  private async costFromJournal(
    tx: Tx,
    journalId?: string | null,
  ): Promise<Decimal> {
    if (!journalId) return new Decimal(0);
    const line = await tx.ledgerEntry.findFirst({
      where: {
        journalEntryId: journalId,
        side: 'DEBIT',
        account: { code: AGENT_ACCOUNTS.BAR_COGS },
      },
      select: { amountRial: true },
    });
    return d(line?.amountRial);
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

  // ═══════════════════════════════════════════
  // خرید و فروش قطعی نمایندگان
  // ═══════════════════════════════════════════

  /**
   * فروش شمش امانی در مدل جدید: شرکت شمش را به قیمت نمایندگی (سهم شرکت) به نماینده
   * می‌فروشد؛ حاشیه‌ی فروش نماینده به مشتری درآمد نماینده است، نه شرکت (حق‌العملی ثبت نمی‌شود).
   *   بد 1040 سهم شرکت / بس 4040 ارزش طلا + بس 4050 اجرت ؛ بد 5050 / بس 1030 (بهای تمام‌شده)
   */
  async journalConsignmentSaleToAgent(
    tx: Tx,
    input: {
      agentTag: string;
      saleNumber: string;
      hologramCode: string;
      weightGrams: Decimal;
      premiumRial: Decimal;
      netPayableRial: Decimal;
    },
  ) {
    const premiumPart = Decimal.min(input.premiumRial, input.netPayableRial);
    const goldPart = input.netPayableRial.minus(premiumPart);
    const costRial = await this.accounting.averageCostRial(
      tx,
      AGENT_ACCOUNTS.CONSIGNMENT,
      input.weightGrams,
    );
    const lines: LedgerLineInput[] = [
      {
        accountCode: AGENT_ACCOUNTS.RECEIVABLE,
        side: 'DEBIT',
        amountRial: input.netPayableRial,
      },
    ];
    if (goldPart.greaterThan(0)) {
      lines.push({
        accountCode: AGENT_ACCOUNTS.BAR_SALE_INCOME,
        side: 'CREDIT',
        amountRial: goldPart,
      });
    }
    if (premiumPart.greaterThan(0)) {
      lines.push({
        accountCode: AGENT_ACCOUNTS.PREMIUM_INCOME,
        side: 'CREDIT',
        amountRial: premiumPart,
      });
    }
    lines.push(
      {
        accountCode: AGENT_ACCOUNTS.BAR_COGS,
        side: 'DEBIT',
        amountRial: costRial,
        amountGrams: input.weightGrams,
      },
      {
        accountCode: AGENT_ACCOUNTS.CONSIGNMENT,
        side: 'CREDIT',
        amountRial: costRial,
        amountGrams: input.weightGrams,
      },
    );
    return this.accounting.postJournal(tx, {
      description: `فروش شمش امانی به نماینده ${input.agentTag} (هم‌زمان با فروش نماینده به مشتری) — ${input.saleNumber} — کد هولوگرام ${input.hologramCode}`,
      totalRial: input.netPayableRial,
      totalGrams: input.weightGrams,
      referenceType: 'AGENT_SALE',
      referenceId: input.saleNumber,
      lines,
    });
  }

  /** واریز به کیف پول نماینده: بد 1010 موجودی نقد / بس 2070 کیف پول نمایندگان */
  async journalWalletDeposit(
    tx: Tx,
    p: {
      agentTag: string;
      number: string;
      amountRial: Decimal;
      methodLabel: string;
    },
  ) {
    return this.accounting.postJournal(tx, {
      description: `واریز به کیف پول نماینده ${p.agentTag} — ${p.number} (${p.methodLabel})`,
      totalRial: p.amountRial,
      totalGrams: 0,
      referenceType: 'AGENT_DEPOSIT',
      referenceId: p.number,
      lines: [
        {
          accountCode: AGENT_ACCOUNTS.CASH,
          side: 'DEBIT',
          amountRial: p.amountRial,
        },
        {
          accountCode: AGENT_ACCOUNTS.AGENT_WALLET,
          side: 'CREDIT',
          amountRial: p.amountRial,
        },
      ],
    });
  }

  /**
   * پرداخت سفارش از کیف پول (بد 2070 / بس 2080) یا برگشت آن هنگام لغو (بد 2080 / بس 2070).
   */
  async journalOrderPayment(
    tx: Tx,
    p: {
      agentTag: string;
      orderNumber: string;
      amountRial: Decimal;
      refund?: boolean;
    },
  ) {
    const refund = !!p.refund;
    return this.accounting.postJournal(tx, {
      description: `${refund ? 'برگشت وجه سفارش لغوشده' : 'پرداخت سفارش خرید شمش از کیف پول'} نماینده ${p.agentTag} — ${p.orderNumber}`,
      totalRial: p.amountRial,
      totalGrams: 0,
      referenceType: 'AGENT_PURCHASE',
      referenceId: p.orderNumber,
      lines: [
        {
          accountCode: refund
            ? AGENT_ACCOUNTS.ORDER_ADVANCE
            : AGENT_ACCOUNTS.AGENT_WALLET,
          side: 'DEBIT',
          amountRial: p.amountRial,
        },
        {
          accountCode: refund
            ? AGENT_ACCOUNTS.AGENT_WALLET
            : AGENT_ACCOUNTS.ORDER_ADVANCE,
          side: 'CREDIT',
          amountRial: p.amountRial,
        },
      ],
    });
  }

  /**
   * تأیید سفارش خرید و صدور حواله: شناسایی درآمد فروش به نماینده و خروج شمش از خزانه.
   *   بد 2080 پیش‌دریافت (یا 1040 در خرید اعتباری) / بس 4040 ارزش طلا + بس 4050 اجرت
   *   بد 5050 بهای تمام‌شده (گرم) / بس 1025 موجودی شمش خزانه (گرم)
   */
  async journalPurchaseSale(
    tx: Tx,
    p: {
      agentTag: string;
      orderNumber: string;
      goldValueRial: Decimal;
      premiumRial: Decimal;
      totalGrams: Decimal;
      credit: boolean;
    },
  ) {
    const total = p.goldValueRial.plus(p.premiumRial);
    const costRial = await this.accounting.averageCostRial(
      tx,
      AGENT_ACCOUNTS.VAULT_BULLION,
      p.totalGrams,
    );
    const lines: LedgerLineInput[] = [
      {
        accountCode: p.credit
          ? AGENT_ACCOUNTS.RECEIVABLE
          : AGENT_ACCOUNTS.ORDER_ADVANCE,
        side: 'DEBIT',
        amountRial: total,
      },
      {
        accountCode: AGENT_ACCOUNTS.BAR_SALE_INCOME,
        side: 'CREDIT',
        amountRial: p.goldValueRial,
      },
    ];
    if (p.premiumRial.greaterThan(0)) {
      lines.push({
        accountCode: AGENT_ACCOUNTS.PREMIUM_INCOME,
        side: 'CREDIT',
        amountRial: p.premiumRial,
      });
    }
    lines.push(
      {
        accountCode: AGENT_ACCOUNTS.BAR_COGS,
        side: 'DEBIT',
        amountRial: costRial,
        amountGrams: p.totalGrams,
      },
      {
        accountCode: AGENT_ACCOUNTS.VAULT_BULLION,
        side: 'CREDIT',
        amountRial: costRial,
        amountGrams: p.totalGrams,
      },
    );
    return this.accounting.postJournal(tx, {
      description: `فروش قطعی شمش به نماینده ${p.agentTag}${
        p.credit ? ' (اعتباری)' : ''
      } — سفارش ${p.orderNumber}`,
      totalRial: total,
      totalGrams: p.totalGrams,
      referenceType: 'AGENT_PURCHASE',
      referenceId: p.orderNumber,
      lines,
    });
  }

  /**
   * خرید شمش ملکی نماینده توسط شرکت: شمش با بهای خرید وارد موجودی خزانه می‌شود.
   *   بد 1025 (گرم + ریال) / بس 2070 کیف پول نماینده یا 1010 (پرداخت مستقیم بانکی)
   *   + بس 1095 واسط مقداری ورود شمش (فقط گرم)
   */
  async journalBuyback(
    tx: Tx,
    p: {
      agentTag: string;
      orderNumber: string;
      amountRial: Decimal;
      grams: Decimal;
      toWallet: boolean;
    },
  ) {
    return this.accounting.postJournal(tx, {
      description: `خرید شمش از نماینده ${p.agentTag} — ${p.orderNumber} (${
        p.toWallet ? 'واریز به کیف پول نماینده' : 'پرداخت بانکی'
      })`,
      totalRial: p.amountRial,
      totalGrams: p.grams,
      referenceType: 'AGENT_BUYBACK',
      referenceId: p.orderNumber,
      lines: [
        {
          accountCode: AGENT_ACCOUNTS.VAULT_BULLION,
          side: 'DEBIT',
          amountRial: p.amountRial,
          amountGrams: p.grams,
        },
        {
          accountCode: p.toWallet
            ? AGENT_ACCOUNTS.AGENT_WALLET
            : AGENT_ACCOUNTS.CASH,
          side: 'CREDIT',
          amountRial: p.amountRial,
        },
        {
          // طرف مقداری ورود شمش (همان الگوی بازخرید از کاربران)
          accountCode: AGENT_ACCOUNTS.BULLION_CLEARING,
          side: 'CREDIT',
          amountGrams: p.grams,
        },
      ],
    });
  }

  /** برداشت از کیف پول نماینده (پرداخت بانکی): بد 2070 / بس 1010 */
  async journalWalletWithdrawal(
    tx: Tx,
    p: { agentTag: string; number: string; amountRial: Decimal },
  ) {
    return this.accounting.postJournal(tx, {
      description: `برداشت از کیف پول نماینده ${p.agentTag} — ${p.number}`,
      totalRial: p.amountRial,
      totalGrams: 0,
      referenceType: 'AGENT_WITHDRAWAL',
      referenceId: p.number,
      lines: [
        {
          accountCode: AGENT_ACCOUNTS.AGENT_WALLET,
          side: 'DEBIT',
          amountRial: p.amountRial,
        },
        {
          accountCode: AGENT_ACCOUNTS.CASH,
          side: 'CREDIT',
          amountRial: p.amountRial,
        },
      ],
    });
  }

  /** تسویه‌ی بدهی نماینده از محل کیف پول: بد 2070 / بس 1040 */
  async journalWalletDebtSettlement(
    tx: Tx,
    p: { agentTag: string; number: string; amountRial: Decimal },
  ) {
    return this.accounting.postJournal(tx, {
      description: `تسویه بدهی نماینده ${p.agentTag} از کیف پول — ${p.number}`,
      totalRial: p.amountRial,
      totalGrams: 0,
      referenceType: 'AGENT_SETTLEMENT',
      referenceId: p.number,
      lines: [
        {
          accountCode: AGENT_ACCOUNTS.AGENT_WALLET,
          side: 'DEBIT',
          amountRial: p.amountRial,
        },
        {
          accountCode: AGENT_ACCOUNTS.RECEIVABLE,
          side: 'CREDIT',
          amountRial: p.amountRial,
        },
      ],
    });
  }

  /**
   * اصلاحیه‌ی کیف پول نماینده توسط مالی:
   *   افزایش موجودی (پاداش/اصلاح): بد 5040 / بس 2070
   *   کاهش موجودی (جریمه/اصلاح):  بد 2070 / بس 4060
   */
  async journalWalletAdjustment(
    tx: Tx,
    p: {
      agentTag: string;
      number: string;
      amountRial: Decimal;
      direction: 'CREDIT' | 'DEBIT';
      reason: string;
    },
  ) {
    // افزایش موجودی کیف پول = بدهی بیشتر شرکت به نماینده (هزینه/اصلاح) و برعکس
    const credit = p.direction === 'CREDIT';
    return this.accounting.postJournal(tx, {
      description: `اصلاحیه کیف پول نماینده ${p.agentTag} — ${p.number}: ${p.reason}`,
      totalRial: p.amountRial,
      totalGrams: 0,
      referenceType: 'AGENT_WALLET_ADJUSTMENT',
      referenceId: p.number,
      lines: credit
        ? [
            {
              accountCode: AGENT_ACCOUNTS.COMMISSION_EXPENSE,
              side: 'DEBIT',
              amountRial: p.amountRial,
            },
            {
              accountCode: AGENT_ACCOUNTS.AGENT_WALLET,
              side: 'CREDIT',
              amountRial: p.amountRial,
            },
          ]
        : [
            {
              accountCode: AGENT_ACCOUNTS.AGENT_WALLET,
              side: 'DEBIT',
              amountRial: p.amountRial,
            },
            {
              accountCode: AGENT_ACCOUNTS.OTHER_INCOME,
              side: 'CREDIT',
              amountRial: p.amountRial,
            },
          ],
    });
  }
}
