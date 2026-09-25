// api/src/accounting/accounting-reports.service.ts
//
// گزارش‌های مالی استاندارد از روی دفتر کل:
//   تراز آزمایشی چهارستونی (دوره‌ای) — دفتر معین با مانده‌ی جاری — صورت سود و زیان —
//   ترازنامه — موقعیت طلا — ارزیابی (تسعیر) طلا — مغایرت‌گیری دفاتر — داشبورد مالی

import { BadRequestException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingService,
  LedgerLineInput,
  isDebitNature,
  toDecimal,
} from './accounting.service';
import { ACC } from './accounts.seed';

const D0 = () => new Decimal(0);
const s = (v: Decimal) => v.toString();

interface Sums {
  dr: Decimal;
  cr: Decimal;
  drG: Decimal;
  crG: Decimal;
}

interface SumRow {
  account_id: string;
  dr: Prisma.Decimal | null;
  cr: Prisma.Decimal | null;
  drg: Prisma.Decimal | null;
  crg: Prisma.Decimal | null;
}

export interface DateRange {
  from?: string;
  to?: string;
}

/** «YYYY-MM-DD» بدون ساعت یعنی تا پایان همان روز */
export function endOfDay(v: string): Date {
  const d = new Date(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) d.setHours(23, 59, 59, 999);
  return d;
}

function parseDate(v: string | undefined, label: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`تاریخ ${label} نامعتبر است`);
  }
  return d;
}

/** مانده با علامت ماهیت حساب (مثبت = مانده‌ی طبیعی) */
function natural(code: string, dr: Decimal, cr: Decimal): Decimal {
  return isDebitNature(code) ? dr.minus(cr) : cr.minus(dr);
}

const SECTION_OF_ROOT: Record<string, string> = {
  '4020': 'SALES',
  '4040': 'SALES',
  '4050': 'SALES',
  '5030': 'SALES_DEDUCTION',
  '5050': 'COGS',
  '5060': 'COGS',
  '4070': 'GOLD_RESULT',
  '5070': 'GOLD_RESULT',
};

@Injectable()
export class AccountingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  // ═══════════════════════════════════════════
  // ابزار پایه: جمع گردش حساب‌ها در یک بازه‌ی تاریخ سند
  // ═══════════════════════════════════════════
  private async sumsByAccount(opts: {
    from?: Date;
    to?: Date;
    before?: Date;
    excludeClosing?: boolean;
  }): Promise<Map<string, Sums>> {
    const conds: Prisma.Sql[] = [Prisma.sql`TRUE`];
    if (opts.from) conds.push(Prisma.sql`je."entry_date" >= ${opts.from}`);
    if (opts.to) conds.push(Prisma.sql`je."entry_date" <= ${opts.to}`);
    if (opts.before) conds.push(Prisma.sql`je."entry_date" < ${opts.before}`);
    if (opts.excludeClosing) {
      conds.push(Prisma.sql`je."source" <> 'CLOSING'::"JournalSource"`);
    }
    const rows = await this.prisma.$queryRaw<SumRow[]>`
      SELECT le."account_id" AS account_id,
        SUM(CASE WHEN le."side" = 'DEBIT'  THEN le."amount_rial"  ELSE 0 END) AS dr,
        SUM(CASE WHEN le."side" = 'CREDIT' THEN le."amount_rial"  ELSE 0 END) AS cr,
        SUM(CASE WHEN le."side" = 'DEBIT'  THEN le."amount_grams" ELSE 0 END) AS drg,
        SUM(CASE WHEN le."side" = 'CREDIT' THEN le."amount_grams" ELSE 0 END) AS crg
      FROM "ledger_entries" le
      JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
      WHERE ${Prisma.join(conds, ' AND ')}
      GROUP BY le."account_id"`;
    return new Map(
      rows.map((r) => [
        r.account_id,
        {
          dr: toDecimal(r.dr),
          cr: toDecimal(r.cr),
          drG: toDecimal(r.drg),
          crG: toDecimal(r.crg),
        },
      ]),
    );
  }

  private async allAccounts() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const rootOf = (id: string): string => {
      let a = byId.get(id);
      while (a?.parentId && byId.get(a.parentId)) a = byId.get(a.parentId);
      return a?.code ?? '';
    };
    return { accounts, byId, rootOf };
  }

  // ═══════════════════════════════════════════
  // تراز آزمایشی چهارستونی
  // ═══════════════════════════════════════════
  async trialBalance(range: DateRange & { hideZero?: boolean }) {
    const from = parseDate(range.from, 'شروع');
    const to = range.to ? endOfDay(range.to) : undefined;
    const { accounts } = await this.allAccounts();
    const [opening, period] = await Promise.all([
      from
        ? this.sumsByAccount({ before: from })
        : Promise.resolve(new Map<string, Sums>()),
      this.sumsByAccount({ from, to }),
    ]);

    const totals = {
      openingDebit: D0(),
      openingCredit: D0(),
      periodDebit: D0(),
      periodCredit: D0(),
      closingDebit: D0(),
      closingCredit: D0(),
    };

    const rows = accounts
      .map((a) => {
        const o: Sums = opening.get(a.id) ?? {
          dr: D0(),
          cr: D0(),
          drG: D0(),
          crG: D0(),
        };
        const p: Sums = period.get(a.id) ?? {
          dr: D0(),
          cr: D0(),
          drG: D0(),
          crG: D0(),
        };
        const openNet = o.dr.minus(o.cr); // + بدهکار / - بستانکار
        const closeNet = openNet.plus(p.dr).minus(p.cr);
        const openG = natural(a.code, o.drG, o.crG);
        const closeG = openG.plus(natural(a.code, p.drG, p.crG));

        const row = {
          accountId: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          parentId: a.parentId,
          isDebitNature: isDebitNature(a.code),
          openingDebitRial: s(openNet.gt(0) ? openNet : D0()),
          openingCreditRial: s(openNet.lt(0) ? openNet.abs() : D0()),
          periodDebitRial: s(p.dr),
          periodCreditRial: s(p.cr),
          closingDebitRial: s(closeNet.gt(0) ? closeNet : D0()),
          closingCreditRial: s(closeNet.lt(0) ? closeNet.abs() : D0()),
          openingGrams: s(openG),
          periodDebitGrams: s(p.drG),
          periodCreditGrams: s(p.crG),
          closingGrams: s(closeG),
        };
        totals.openingDebit = totals.openingDebit.plus(row.openingDebitRial);
        totals.openingCredit = totals.openingCredit.plus(row.openingCreditRial);
        totals.periodDebit = totals.periodDebit.plus(p.dr);
        totals.periodCredit = totals.periodCredit.plus(p.cr);
        totals.closingDebit = totals.closingDebit.plus(row.closingDebitRial);
        totals.closingCredit = totals.closingCredit.plus(row.closingCreditRial);
        return row;
      })
      .filter(
        (r) =>
          !range.hideZero ||
          [
            r.openingDebitRial,
            r.openingCreditRial,
            r.periodDebitRial,
            r.periodCreditRial,
            r.closingGrams,
          ].some((v) => v !== '0'),
      );

    return {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      rows,
      totals: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [`${k}Rial`, s(v)]),
      ),
      isBalanced:
        totals.periodDebit.equals(totals.periodCredit) &&
        totals.closingDebit.equals(totals.closingCredit),
    };
  }

  // ═══════════════════════════════════════════
  // دفتر معین با مانده‌ی جاری (به‌همراه زیرحساب‌ها)
  // ═══════════════════════════════════════════
  async accountStatement(
    accountId: string,
    query: DateRange & {
      page?: number;
      limit?: number;
      includeChildren?: boolean;
    },
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) return null;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 50), 200);
    const from = parseDate(query.from, 'شروع');
    const to = query.to ? endOfDay(query.to) : undefined;

    const ids = [account.id];
    if (query.includeChildren !== false) {
      const all = await this.prisma.account.findMany({
        select: { id: true, parentId: true },
      });
      const queue = [account.id];
      while (queue.length) {
        const cur = queue.shift();
        for (const c of all.filter((x) => x.parentId === cur)) {
          ids.push(c.id);
          queue.push(c.id);
        }
      }
    }

    const conds: Prisma.Sql[] = [
      Prisma.sql`le."account_id" IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})`,
    ];
    if (from) conds.push(Prisma.sql`je."entry_date" >= ${from}`);
    if (to) conds.push(Prisma.sql`je."entry_date" <= ${to}`);
    const where = Prisma.join(conds, ' AND ');

    const openingRows = from
      ? await this.prisma.$queryRaw<
          {
            dr: Prisma.Decimal;
            cr: Prisma.Decimal;
            drg: Prisma.Decimal;
            crg: Prisma.Decimal;
          }[]
        >`
          SELECT
            COALESCE(SUM(CASE WHEN le."side"='DEBIT'  THEN le."amount_rial"  END),0) AS dr,
            COALESCE(SUM(CASE WHEN le."side"='CREDIT' THEN le."amount_rial"  END),0) AS cr,
            COALESCE(SUM(CASE WHEN le."side"='DEBIT'  THEN le."amount_grams" END),0) AS drg,
            COALESCE(SUM(CASE WHEN le."side"='CREDIT' THEN le."amount_grams" END),0) AS crg
          FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
          WHERE le."account_id" IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
            AND je."entry_date" < ${from}`
      : [];
    const o = openingRows[0];
    const openingRial = o
      ? natural(account.code, toDecimal(o.dr), toDecimal(o.cr))
      : D0();
    const openingGrams = o
      ? natural(account.code, toDecimal(o.drg), toDecimal(o.crg))
      : D0();

    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        side: 'DEBIT' | 'CREDIT';
        amount_rial: Prisma.Decimal;
        amount_grams: Prisma.Decimal;
        line_description: string | null;
        account_code: string;
        journal_id: string;
        reference_number: number;
        permanent_number: number | null;
        journal_description: string | null;
        entry_date: Date;
        source: string;
        run_rial: Prisma.Decimal;
        run_grams: Prisma.Decimal;
      }[]
    >`
      SELECT le."id", le."side", le."amount_rial", le."amount_grams",
        le."description" AS line_description, a."code" AS account_code,
        je."id" AS journal_id, je."reference_number", je."permanent_number",
        je."description" AS journal_description, je."entry_date", je."source"::text AS source,
        SUM(CASE WHEN le."side"='DEBIT' THEN le."amount_rial" ELSE -le."amount_rial" END)
          OVER (ORDER BY je."entry_date", je."reference_number", le."id") AS run_rial,
        SUM(CASE WHEN le."side"='DEBIT' THEN le."amount_grams" ELSE -le."amount_grams" END)
          OVER (ORDER BY je."entry_date", je."reference_number", le."id") AS run_grams
      FROM "ledger_entries" le
      JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
      JOIN "accounts" a ON a."id" = le."account_id"
      WHERE ${where}
      ORDER BY je."entry_date", je."reference_number", le."id"
      LIMIT ${limit} OFFSET ${(page - 1) * limit}`;

    const [countRow] = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM "ledger_entries" le
      JOIN "journal_entries" je ON je."id" = le."journal_entry_id" WHERE ${where}`;
    const total = Number(countRow?.c ?? 0);
    const sign = isDebitNature(account.code) ? 1 : -1;

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        isDebitNature: isDebitNature(account.code),
        balanceRial: account.balanceRial.toString(),
        balanceGrams: account.balanceGrams.toString(),
      },
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      openingRial: s(openingRial),
      openingGrams: s(openingGrams),
      data: rows.map((r) => ({
        id: r.id,
        accountCode: r.account_code,
        side: r.side,
        amountRial: r.amount_rial.toString(),
        amountGrams: r.amount_grams.toString(),
        description: r.line_description ?? r.journal_description,
        journalEntryId: r.journal_id,
        referenceNumber: r.reference_number,
        permanentNumber: r.permanent_number,
        source: r.source,
        entryDate: r.entry_date.toISOString(),
        balanceRial: s(openingRial.plus(toDecimal(r.run_rial).times(sign))),
        balanceGrams: s(openingGrams.plus(toDecimal(r.run_grams).times(sign))),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ═══════════════════════════════════════════
  // صورت سود و زیان
  // ═══════════════════════════════════════════
  async incomeStatement(range: DateRange) {
    const from = parseDate(range.from, 'شروع');
    const to = range.to ? endOfDay(range.to) : undefined;
    const { accounts, rootOf } = await this.allAccounts();
    const sums = await this.sumsByAccount({ from, to, excludeClosing: true });

    type Line = { code: string; name: string; amountRial: string };
    const sections: Record<string, Line[]> = {
      SALES: [],
      SALES_DEDUCTION: [],
      COGS: [],
      OTHER_INCOME: [],
      GOLD_RESULT: [],
      EXPENSES: [],
    };
    const totals: Record<string, Decimal> = Object.fromEntries(
      Object.keys(sections).map((k) => [k, D0()]),
    );

    for (const a of accounts) {
      if (a.type !== 'INCOME' && a.type !== 'EXPENSE') continue;
      const p = sums.get(a.id);
      if (!p) continue;
      // درآمد: مثبت = بستانکار؛ هزینه: مثبت = بدهکار
      const amount = natural(a.code, p.dr, p.cr);
      if (amount.isZero()) continue;
      const root = rootOf(a.id);
      let section = SECTION_OF_ROOT[root];
      if (!section) section = a.type === 'INCOME' ? 'OTHER_INCOME' : 'EXPENSES';
      // نتیجه‌ی طلا: سود مثبت، زیان منفی
      const signed =
        section === 'GOLD_RESULT' && a.type === 'EXPENSE'
          ? amount.neg()
          : amount;
      sections[section].push({
        code: a.code,
        name: a.name,
        amountRial: s(signed),
      });
      totals[section] = totals[section].plus(signed);
    }

    const netSales = totals.SALES.minus(totals.SALES_DEDUCTION);
    const grossProfit = netSales.minus(totals.COGS);
    const operatingProfit = grossProfit
      .plus(totals.OTHER_INCOME)
      .minus(totals.EXPENSES);
    const netProfit = operatingProfit.plus(totals.GOLD_RESULT);

    return {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
      sections,
      totals: Object.fromEntries(
        Object.entries(totals).map(([k, v]) => [k, s(v)]),
      ),
      netSalesRial: s(netSales),
      grossProfitRial: s(grossProfit),
      operatingProfitRial: s(operatingProfit),
      netProfitRial: s(netProfit),
      note: 'ستون گرمی حساب‌های بهای تمام‌شده، وزن شمش‌های فروخته‌شده را نشان می‌دهد؛ اگر ریال آن صفر است موجودی افتتاحیه‌ی شمش با بهای تمام‌شده ثبت نشده است',
    };
  }

  // ═══════════════════════════════════════════
  // ترازنامه
  // ═══════════════════════════════════════════
  async balanceSheet(asOf?: string) {
    const to = asOf ? endOfDay(asOf) : undefined;
    const { accounts } = await this.allAccounts();
    const sums = await this.sumsByAccount({ to });

    type Line = {
      code: string;
      name: string;
      parentId: string | null;
      amountRial: string;
      grams: string;
    };
    const groups: Record<'ASSET' | 'LIABILITY' | 'EQUITY', Line[]> = {
      ASSET: [],
      LIABILITY: [],
      EQUITY: [],
    };
    const total = { ASSET: D0(), LIABILITY: D0(), EQUITY: D0() };
    let earnings = D0();

    for (const a of accounts) {
      const p = sums.get(a.id);
      if (!p) continue;
      const amount = natural(a.code, p.dr, p.cr);
      const grams = natural(a.code, p.drG, p.crG);
      if (a.type === 'INCOME') {
        earnings = earnings.plus(amount);
        continue;
      }
      if (a.type === 'EXPENSE') {
        earnings = earnings.minus(amount);
        continue;
      }
      if (amount.isZero() && grams.isZero()) continue;
      groups[a.type].push({
        code: a.code,
        name: a.name,
        parentId: a.parentId,
        amountRial: s(amount),
        grams: s(grams),
      });
      total[a.type] = total[a.type].plus(amount);
    }

    const equityTotal = total.EQUITY.plus(earnings);
    const liabilitiesAndEquity = total.LIABILITY.plus(equityTotal);
    return {
      asOf: to?.toISOString() ?? new Date().toISOString(),
      assets: groups.ASSET,
      liabilities: groups.LIABILITY,
      equity: groups.EQUITY,
      currentEarningsRial: s(earnings),
      totalAssetsRial: s(total.ASSET),
      totalLiabilitiesRial: s(total.LIABILITY),
      totalEquityRial: s(equityTotal),
      totalLiabilitiesAndEquityRial: s(liabilitiesAndEquity),
      isBalanced: total.ASSET.equals(liabilitiesAndEquity),
    };
  }

  // ═══════════════════════════════════════════
  // موقعیت طلا (گرمی و ارزش روز)
  // ═══════════════════════════════════════════
  async goldPosition() {
    const codes = [
      ACC.GOLD_VAULT,
      ACC.GOLD_IN_TRANSIT,
      ACC.GOLD_COVERAGE,
      ACC.USER_GOLD,
      ACC.BULLION,
      ACC.CONSIGNMENT,
      ACC.BULLION_CLEARING,
    ];
    const [accounts, price, walletSum] = await Promise.all([
      this.prisma.account.findMany({ where: { code: { in: codes } } }),
      this.accounting.currentGoldPriceRial(),
      this.prisma.wallet.aggregate({ _sum: { goldBalanceGrams: true } }),
    ]);
    const get = (c: string) => accounts.find((a) => a.code === c);
    const row = (c: string, revalue: boolean) => {
      const a = get(c);
      const grams = toDecimal(a?.balanceGrams);
      const book = toDecimal(a?.balanceRial);
      const market = grams.times(price).toDecimalPlaces(0);
      return {
        code: c,
        name: a?.name ?? c,
        grams: s(grams),
        bookValueRial: s(book),
        marketValueRial: revalue ? s(market) : null,
        unrealizedRial: revalue
          ? s(isDebitNature(c) ? market.minus(book) : book.minus(market))
          : null,
      };
    };
    const vault = toDecimal(get(ACC.GOLD_VAULT)?.balanceGrams);
    const inTransit = toDecimal(get(ACC.GOLD_IN_TRANSIT)?.balanceGrams);
    const liability = toDecimal(walletSum._sum.goldBalanceGrams);
    return {
      pricePerGramRial: s(price),
      meltedGold: [
        row(ACC.GOLD_VAULT, true),
        row(ACC.GOLD_IN_TRANSIT, false),
        row(ACC.USER_GOLD, true),
        row(ACC.GOLD_COVERAGE, false),
      ],
      bullion: [
        row(ACC.BULLION, false),
        row(ACC.CONSIGNMENT, false),
        row(ACC.BULLION_CLEARING, false),
      ],
      walletGoldGrams: s(liability),
      netMeltedPositionGrams: s(vault.plus(inTransit).minus(liability)),
      netMeltedPositionRial: s(
        vault.plus(inTransit).minus(liability).times(price).toDecimalPlaces(0),
      ),
    };
  }

  // ═══════════════════════════════════════════
  // ارزیابی (تسعیر) طلای آب‌شده به قیمت روز
  // ═══════════════════════════════════════════
  private async buildRevaluation(
    tx: Prisma.TransactionClient | PrismaService,
    priceOverride?: string,
  ) {
    const price = priceOverride
      ? new Decimal(priceOverride)
      : await this.accounting.currentGoldPriceRial(tx);
    if (price.lte(0)) {
      throw new BadRequestException('قیمت روز طلا در دسترس نیست');
    }
    const accounts = await tx.account.findMany({
      where: { code: { in: [ACC.GOLD_VAULT, ACC.USER_GOLD] } },
    });
    const lines: LedgerLineInput[] = [];
    const items = accounts.map((a) => {
      const grams = toDecimal(a.balanceGrams);
      const book = toDecimal(a.balanceRial);
      const target = grams.times(price).toDecimalPlaces(0);
      const diff = target.minus(book);
      // دارایی: افزایش ارزش = سود؛ بدهی: افزایش ارزش = زیان
      const gain = isDebitNature(a.code) ? diff : diff.neg();
      if (!diff.isZero()) {
        const up = diff.gt(0);
        lines.push({
          accountCode: a.code,
          side: isDebitNature(a.code) === up ? 'DEBIT' : 'CREDIT',
          amountRial: diff.abs(),
        });
        lines.push({
          accountCode: gain.gt(0) ? ACC.GOLD_GAIN : ACC.GOLD_LOSS,
          side: gain.gt(0) ? 'CREDIT' : 'DEBIT',
          amountRial: diff.abs(),
        });
      }
      return {
        code: a.code,
        name: a.name,
        grams: s(grams),
        bookValueRial: s(book),
        targetValueRial: s(target),
        adjustmentRial: s(diff),
        gainRial: s(gain),
      };
    });
    const netGain = items.reduce((t, i) => t.plus(i.gainRial), D0());
    return { price, items, lines, netGain };
  }

  async revaluationPreview(price?: string) {
    const r = await this.buildRevaluation(this.prisma, price);
    return {
      pricePerGramRial: s(r.price),
      items: r.items,
      netGainRial: s(r.netGain),
      hasAdjustment: r.lines.length > 0,
    };
  }

  async postRevaluation(adminId: string, price?: string) {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT 1 FROM "accounts" WHERE "code" IN (${ACC.GOLD_VAULT}, ${ACC.USER_GOLD}) FOR UPDATE`;
        const r = await this.buildRevaluation(tx, price);
        if (!r.lines.length) {
          throw new BadRequestException(
            'ارزش دفتری طلا با قیمت روز برابر است؛ سندی لازم نیست',
          );
        }
        const total = r.lines
          .filter((l) => l.side === 'DEBIT')
          .reduce((t, l) => t.plus(toDecimal(l.amountRial)), D0());
        const journal = await this.accounting.postJournal(tx, {
          description: `ارزیابی (تسعیر) طلای آب‌شده به قیمت ${r.price.toString()} ریال برای هر گرم`,
          totalRial: total,
          totalGrams: 0,
          source: 'REVALUATION',
          referenceType: 'GOLD_REVALUATION',
          createdByAdminId: adminId,
          lines: r.lines,
        });
        return {
          message: 'سند ارزیابی طلا ثبت شد',
          journalEntryId: journal.id,
          netGainRial: s(r.netGain),
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }

  // ═══════════════════════════════════════════
  // مغایرت‌گیری دفتر کل با دفاتر معین و موجودی‌های عملیاتی
  // ═══════════════════════════════════════════
  async reconciliation() {
    const [
      accounts,
      ledgerTotals,
      wallets,
      agents,
      atAgent,
      partners,
      suppliers,
      inTransit,
    ] = await Promise.all([
      this.prisma.account.findMany({ orderBy: { code: 'asc' } }),
      this.sumsByAccount({}),
      this.prisma.wallet.aggregate({
        _sum: { rialBalance: true, goldBalanceGrams: true },
      }),
      this.prisma.agent.aggregate({ _sum: { balanceRial: true } }),
      this.prisma.hologramCode.aggregate({
        where: { status: 'AT_AGENT' },
        _sum: { weightGrams: true },
        _count: true,
      }),
      this.prisma.salesPartner.aggregate({ _sum: { balanceRial: true } }),
      this.prisma.supplier.aggregate({ _sum: { balanceRial: true } }),
      this.prisma.treasuryOrder.aggregate({
        where: { status: 'CONFIRMED', side: 'BUY' },
        _sum: { fineGrams: true, goldValueRial: true, wageRial: true },
      }),
    ]);
    const acc = (c: string) => accounts.find((a) => a.code === c);

    // ۱) سلامت مانده‌های ذخیره‌شده: مانده‌ی حساب = جمع سطرهای دفتر
    const integrity = accounts
      .map((a) => {
        const t = ledgerTotals.get(a.id);
        const rial = t ? natural(a.code, t.dr, t.cr) : D0();
        const grams = t ? natural(a.code, t.drG, t.crG) : D0();
        return {
          code: a.code,
          name: a.name,
          storedRial: a.balanceRial.toString(),
          ledgerRial: s(rial),
          storedGrams: a.balanceGrams.toString(),
          ledgerGrams: s(grams),
          ok:
            rial.equals(toDecimal(a.balanceRial)) &&
            grams.equals(toDecimal(a.balanceGrams)),
        };
      })
      .filter((r) => !r.ok);

    const check = (
      key: string,
      label: string,
      ledger: Decimal,
      subsidiary: Decimal,
      unit: 'RIAL' | 'GRAM',
      hint: string,
    ) => ({
      key,
      label,
      unit,
      ledger: s(ledger),
      subsidiary: s(subsidiary),
      difference: s(ledger.minus(subsidiary)),
      ok: ledger
        .minus(subsidiary)
        .abs()
        .lte(unit === 'GRAM' ? 0.0001 : 0),
      hint,
    });

    const checks = [
      check(
        'USER_RIAL',
        'بدهی ریالی کاربران (2010) ↔ جمع موجودی ریالی کیف پول‌ها',
        toDecimal(acc(ACC.USER_RIAL)?.balanceRial),
        toDecimal(wallets._sum.rialBalance),
        'RIAL',
        'اختلاف معمولاً از شارژ/کسر مستقیم کیف پول بدون سند یا اسناد پیش از راه‌اندازی دفتر کل است',
      ),
      check(
        'USER_GOLD',
        'بدهی طلایی کاربران (2020) ↔ جمع طلای کیف پول‌ها',
        toDecimal(acc(ACC.USER_GOLD)?.balanceGrams),
        toDecimal(wallets._sum.goldBalanceGrams),
        'GRAM',
        'باید دقیقاً برابر باشد؛ در غیر این صورت عملیاتی بدون سند حسابداری روی کیف پول انجام شده است',
      ),
      check(
        'AGENT_RECEIVABLE',
        'دریافتنی نمایندگان (1040) ↔ جمع مانده‌ی صورتحساب نمایندگان',
        toDecimal(acc(ACC.AGENT_RECEIVABLE)?.balanceRial),
        toDecimal(agents._sum.balanceRial),
        'RIAL',
        'دفتر معین نمایندگان و دفتر کل همیشه با هم ثبت می‌شوند',
      ),
      check(
        'CONSIGNMENT',
        'شمش امانی نزد نمایندگان (1030) ↔ وزن شمش‌های با وضعیت «نزد نماینده»',
        toDecimal(acc(ACC.CONSIGNMENT)?.balanceGrams),
        toDecimal(atAgent._sum.weightGrams),
        'GRAM',
        `${atAgent._count} شمش نزد نمایندگان`,
      ),
      check(
        'PARTNER_RECEIVABLE',
        'دریافتنی از شرکای فروش (1050) ↔ جمع مانده‌ی شرکا',
        toDecimal(acc(ACC.PARTNER_RECEIVABLE)?.balanceRial),
        toDecimal(partners._sum.balanceRial),
        'RIAL',
        'مانده‌ی هر شریک در صفحه‌ی شرکای فروش قابل مشاهده است',
      ),
      check(
        'SUPPLIER_PAYABLE',
        'پرداختنی تأمین‌کنندگان (2040) ↔ جمع بدهی به تأمین‌کنندگان',
        toDecimal(acc(ACC.SUPPLIER_PAYABLE)?.balanceRial),
        toDecimal(suppliers._sum.balanceRial).neg(),
        'RIAL',
        'مانده‌ی منفی تأمین‌کننده = بدهی ما',
      ),
      check(
        'IN_TRANSIT',
        'طلای در راه (1060) ↔ سفارش‌های خرید قطعی‌شده‌ی دریافت‌نشده',
        toDecimal(acc(ACC.GOLD_IN_TRANSIT)?.balanceGrams),
        toDecimal(inTransit._sum.fineGrams),
        'GRAM',
        'پس از ثبت رسید ورود به خزانه صفر می‌شود',
      ),
    ];

    const tb = await this.trialBalance({});
    return {
      generatedAt: new Date().toISOString(),
      trialBalanced: tb.isBalanced,
      checks,
      integrityIssues: integrity,
      allOk: tb.isBalanced && !integrity.length && checks.every((c) => c.ok),
    };
  }

  // ═══════════════════════════════════════════
  // داشبورد مالی
  // ═══════════════════════════════════════════
  async dashboard() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [
      accounts,
      position,
      monthPl,
      pendingVouchers,
      draftOrders,
      overduePartner,
    ] = await Promise.all([
      this.prisma.account.findMany({
        where: {
          code: {
            in: [
              ACC.CASH,
              ACC.USER_RIAL,
              ACC.AGENT_RECEIVABLE,
              ACC.PARTNER_RECEIVABLE,
              ACC.SUPPLIER_PAYABLE,
              ACC.TAX_PAYABLE,
              ACC.BULLION,
              ACC.CONSIGNMENT,
            ],
          },
        },
      }),
      this.goldPosition(),
      this.incomeStatement({ from: monthStart.toISOString() }),
      this.prisma.manualVoucher.count({ where: { status: 'DRAFT' } }),
      this.prisma.treasuryOrder.count({
        where: { status: { in: ['DRAFT', 'CONFIRMED'] } },
      }),
      this.prisma.partnerOrder.aggregate({
        where: { status: 'CONFIRMED', dueDate: { lt: now } },
        _sum: { netReceivableRial: true },
        _count: true,
      }),
    ]);
    const bal = (c: string) => {
      const a = accounts.find((x) => x.code === c);
      return {
        rial: a?.balanceRial.toString() ?? '0',
        grams: a?.balanceGrams.toString() ?? '0',
      };
    };
    return {
      cash: bal(ACC.CASH),
      userRialLiability: bal(ACC.USER_RIAL),
      agentReceivable: bal(ACC.AGENT_RECEIVABLE),
      partnerReceivable: bal(ACC.PARTNER_RECEIVABLE),
      supplierPayable: bal(ACC.SUPPLIER_PAYABLE),
      taxPayable: bal(ACC.TAX_PAYABLE),
      bullionVault: bal(ACC.BULLION),
      bullionAtAgents: bal(ACC.CONSIGNMENT),
      goldPosition: position,
      monthToDate: {
        from: monthStart.toISOString(),
        netSalesRial: monthPl.netSalesRial,
        grossProfitRial: monthPl.grossProfitRial,
        netProfitRial: monthPl.netProfitRial,
        feeIncomeRial:
          monthPl.sections.OTHER_INCOME.find((l) => l.code === ACC.TRADE_FEE)
            ?.amountRial ?? '0',
      },
      pendingManualVouchers: pendingVouchers,
      openTreasuryOrders: draftOrders,
      overduePartnerOrders: {
        count: overduePartner._count,
        amountRial: (overduePartner._sum.netReceivableRial ?? 0).toString(),
      },
    };
  }
}
