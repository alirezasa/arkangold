// api/src/accounting/accounting-analytics.service.ts
//
// گزارش‌های تکمیلی دفتر کل:
//   - صورت جریان وجوه نقد (روش مستقیم) از روی سطرهای حساب‌های نقد و بانک (1010 و معین‌ها)
//   - سود و زیان مقایسه‌ای ماهانه (ماه‌های شمسی)
//   - گزارش مالیات و ارزش افزوده (2030 مالیات پرداختنی، 1080 اعتبار ارزش افزوده خرید)
import { BadRequestException, Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import * as jalaali from 'jalaali-js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isDebitNature, toDecimal } from './accounting.service';
import { endOfDay } from './accounting-reports.service';

const JALALI_MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

type CashSection = 'OPERATING' | 'INVESTING' | 'FINANCING';

const SECTION_FA: Record<CashSection, string> = {
  OPERATING: 'فعالیت‌های عملیاتی',
  INVESTING: 'فعالیت‌های سرمایه‌گذاری',
  FINANCING: 'فعالیت‌های تأمین مالی',
};

/** دسته‌ی جریان نقد بر اساس حساب کلِ طرف مقابل */
function cashSectionOf(rootCode: string): CashSection {
  if (rootCode === '1110' || rootCode === '1120') return 'INVESTING';
  if (rootCode.startsWith('3')) return 'FINANCING';
  return 'OPERATING';
}

interface LineRow {
  journal_id: string;
  account_id: string;
  side: 'DEBIT' | 'CREDIT';
  amount_rial: Prisma.Decimal;
}

function parseRange(from?: string, to?: string) {
  const f = from ? new Date(from) : undefined;
  const t = to ? endOfDay(to) : undefined;
  if ((f && Number.isNaN(f.getTime())) || (t && Number.isNaN(t.getTime()))) {
    throw new BadRequestException('بازه‌ی تاریخ نامعتبر است');
  }
  return { f, t };
}

@Injectable()
export class AccountingAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async accountTree() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const rootOf = (id: string) => {
      let a = byId.get(id);
      while (a?.parentId && byId.get(a.parentId)) a = byId.get(a.parentId);
      return a?.code ?? '';
    };
    return { accounts, byId, rootOf };
  }

  // ═══════════════════════════ صورت جریان وجوه نقد ═══════════════════════════

  async cashFlow(from?: string, to?: string) {
    const { f, t } = parseRange(from, to);
    const { accounts, rootOf } = await this.accountTree();
    const cashIds = new Set(
      accounts.filter((a) => rootOf(a.id) === '1010').map((a) => a.id),
    );
    if (!cashIds.size)
      throw new BadRequestException('حساب نقد و بانک (1010) یافت نشد');
    const cashIdList = [...cashIds];

    const conds: Prisma.Sql[] = [
      Prisma.sql`je."source" <> 'CLOSING'::"JournalSource"`,
    ];
    if (f) conds.push(Prisma.sql`je."entry_date" >= ${f}`);
    if (t) conds.push(Prisma.sql`je."entry_date" <= ${t}`);

    // همه‌ی سطرهای اسنادی که حداقل یک سطر روی حساب نقد/بانک دارند
    const rows = await this.prisma.$queryRaw<LineRow[]>`
      SELECT le."journal_entry_id" AS journal_id, le."account_id" AS account_id,
             le."side"::text AS side, le."amount_rial" AS amount_rial
      FROM "ledger_entries" le
      JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
      WHERE ${Prisma.join(conds, ' AND ')}
        AND le."journal_entry_id" IN (
          SELECT DISTINCT l2."journal_entry_id" FROM "ledger_entries" l2
          WHERE l2."account_id" IN (${Prisma.join(cashIdList.map((id) => Prisma.sql`${id}::uuid`))})
        )`;

    const byJournal = new Map<string, LineRow[]>();
    for (const r of rows) {
      const list = byJournal.get(r.journal_id) ?? [];
      list.push(r);
      byJournal.set(r.journal_id, list);
    }

    // سهم هر حساب طرف مقابل از ورود/خروج نقد؛ ورودی نقد به نسبت بین سطرهای بستانکار غیرنقد
    // و خروجی نقد به نسبت بین سطرهای بدهکار غیرنقد همان سند تقسیم می‌شود
    const perAccount = new Map<string, { inflow: Decimal; outflow: Decimal }>();
    for (const lines of byJournal.values()) {
      let cashIn = new Decimal(0);
      let cashOut = new Decimal(0);
      let otherCr = new Decimal(0);
      let otherDr = new Decimal(0);
      for (const l of lines) {
        const amt = toDecimal(l.amount_rial);
        if (cashIds.has(l.account_id)) {
          if (l.side === 'DEBIT') cashIn = cashIn.plus(amt);
          else cashOut = cashOut.plus(amt);
        } else if (l.side === 'CREDIT') otherCr = otherCr.plus(amt);
        else otherDr = otherDr.plus(amt);
      }
      // جابه‌جایی بین حساب‌های بانکی شرکت اثر خالص ندارد
      const net = cashIn.minus(cashOut);
      if (otherCr.isZero() && otherDr.isZero()) continue;
      const inflow = net.gt(0) ? net : new Decimal(0);
      const outflow = net.lt(0) ? net.neg() : new Decimal(0);
      for (const l of lines) {
        if (cashIds.has(l.account_id)) continue;
        const amt = toDecimal(l.amount_rial);
        const e = perAccount.get(l.account_id) ?? {
          inflow: new Decimal(0),
          outflow: new Decimal(0),
        };
        if (l.side === 'CREDIT' && inflow.gt(0) && otherCr.gt(0)) {
          e.inflow = e.inflow.plus(inflow.times(amt).div(otherCr));
        }
        if (l.side === 'DEBIT' && outflow.gt(0) && otherDr.gt(0)) {
          e.outflow = e.outflow.plus(outflow.times(amt).div(otherDr));
        }
        perAccount.set(l.account_id, e);
      }
    }

    // تجمیع در سطح حساب کل
    const byRoot = new Map<string, { inflow: Decimal; outflow: Decimal }>();
    for (const [accountId, v] of perAccount) {
      const root = rootOf(accountId);
      const e = byRoot.get(root) ?? {
        inflow: new Decimal(0),
        outflow: new Decimal(0),
      };
      e.inflow = e.inflow.plus(v.inflow);
      e.outflow = e.outflow.plus(v.outflow);
      byRoot.set(root, e);
    }
    const nameOf = new Map(accounts.map((a) => [a.code, a.name]));
    const sections: Record<
      CashSection,
      {
        code: string;
        name: string;
        inflowRial: string;
        outflowRial: string;
        netRial: string;
      }[]
    > = {
      OPERATING: [],
      INVESTING: [],
      FINANCING: [],
    };
    const totals: Record<CashSection, Decimal> = {
      OPERATING: new Decimal(0),
      INVESTING: new Decimal(0),
      FINANCING: new Decimal(0),
    };
    for (const [code, v] of [...byRoot.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const inflow = v.inflow.toDecimalPlaces(0);
      const outflow = v.outflow.toDecimalPlaces(0);
      if (inflow.isZero() && outflow.isZero()) continue;
      const sec = cashSectionOf(code);
      const net = inflow.minus(outflow);
      sections[sec].push({
        code,
        name: nameOf.get(code) ?? code,
        inflowRial: inflow.toString(),
        outflowRial: outflow.toString(),
        netRial: net.toString(),
      });
      totals[sec] = totals[sec].plus(net);
    }

    // مانده‌ی نقد ابتدا و انتهای دوره از دفتر
    const balance = async (until?: Date, strictBefore = false) => {
      const c: Prisma.Sql[] = [
        Prisma.sql`le."account_id" IN (${Prisma.join(cashIdList.map((id) => Prisma.sql`${id}::uuid`))})`,
      ];
      if (until)
        c.push(
          strictBefore
            ? Prisma.sql`je."entry_date" < ${until}`
            : Prisma.sql`je."entry_date" <= ${until}`,
        );
      const r = await this.prisma.$queryRaw<{ bal: Prisma.Decimal | null }[]>`
        SELECT SUM(CASE WHEN le."side" = 'DEBIT' THEN le."amount_rial" ELSE -le."amount_rial" END) AS bal
        FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
        WHERE ${Prisma.join(c, ' AND ')}`;
      return toDecimal(r[0]?.bal);
    };
    const opening = f ? await balance(f, true) : new Decimal(0);
    const closing = await balance(t);
    const netChange = totals.OPERATING.plus(totals.INVESTING).plus(
      totals.FINANCING,
    );

    // جزئیات حساب‌های بانکی معین
    const perBank = accounts
      .filter((a) => cashIds.has(a.id))
      .map((a) => ({ code: a.code, name: a.name }));

    return {
      from: f?.toISOString() ?? null,
      to: t?.toISOString() ?? null,
      sections: (Object.keys(sections) as CashSection[]).map((k) => ({
        key: k,
        title: SECTION_FA[k],
        lines: sections[k],
        netRial: totals[k].toString(),
      })),
      openingCashRial: opening.toString(),
      netChangeRial: netChange.toString(),
      closingCashRial: closing.toString(),
      // اختلاف ناشی از گرد کردن تسهیم (باید صفر یا چند ریال باشد)
      roundingDifferenceRial: closing
        .minus(opening)
        .minus(netChange)
        .toString(),
      cashAccounts: perBank,
    };
  }

  // ═══════════════════════════ سود و زیان ماهانه ═══════════════════════════

  async monthlyIncome(from?: string, to?: string) {
    const { f, t } = parseRange(from, to);
    if (!f || !t)
      throw new BadRequestException('بازه‌ی شروع و پایان الزامی است');
    if (t.getTime() - f.getTime() > 400 * 86_400_000) {
      throw new BadRequestException('بازه‌ی گزارش ماهانه حداکثر ۱۳ ماه است');
    }
    const rows = await this.prisma.$queryRaw<
      {
        account_id: string;
        day: Date;
        dr: Prisma.Decimal | null;
        cr: Prisma.Decimal | null;
      }[]
    >`
      SELECT le."account_id" AS account_id,
             ((je."entry_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date AS day,
             SUM(CASE WHEN le."side" = 'DEBIT'  THEN le."amount_rial" ELSE 0 END) AS dr,
             SUM(CASE WHEN le."side" = 'CREDIT' THEN le."amount_rial" ELSE 0 END) AS cr
      FROM "ledger_entries" le
      JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
      JOIN "accounts" a ON a."id" = le."account_id"
      WHERE je."entry_date" >= ${f} AND je."entry_date" <= ${t}
        AND je."source" <> 'CLOSING'::"JournalSource"
        AND a."type" IN ('INCOME', 'EXPENSE')
      GROUP BY 1, 2`;

    const { accounts } = await this.accountTree();
    const accById = new Map(accounts.map((a) => [a.id, a]));
    const monthKey = (d: Date) => {
      const j = jalaali.toJalaali(
        d.getUTCFullYear(),
        d.getUTCMonth() + 1,
        d.getUTCDate(),
      );
      return {
        key: `${j.jy}-${String(j.jm).padStart(2, '0')}`,
        label: `${JALALI_MONTHS[j.jm - 1]} ${j.jy}`,
      };
    };

    const months = new Map<string, string>();
    // همه‌ی ماه‌های بازه (حتی بدون گردش)
    for (let d = new Date(f); d <= t; d = new Date(d.getTime() + 86_400_000)) {
      const m = monthKey(
        new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())),
      );
      months.set(m.key, m.label);
    }
    const table = new Map<string, Map<string, Decimal>>();
    for (const r of rows) {
      const a = accById.get(r.account_id);
      if (!a) continue;
      const m = monthKey(new Date(r.day));
      months.set(m.key, m.label);
      const amount = isDebitNature(a.code)
        ? toDecimal(r.dr).minus(toDecimal(r.cr))
        : toDecimal(r.cr).minus(toDecimal(r.dr));
      const perMonth = table.get(a.id) ?? new Map<string, Decimal>();
      perMonth.set(m.key, (perMonth.get(m.key) ?? new Decimal(0)).plus(amount));
      table.set(a.id, perMonth);
    }
    const monthKeys = [...months.keys()].sort();
    const lineOf = (type: 'INCOME' | 'EXPENSE') =>
      accounts
        .filter((a) => a.type === type && table.has(a.id))
        .map((a) => {
          const perMonth = table.get(a.id)!;
          const values = monthKeys.map((k) =>
            (perMonth.get(k) ?? new Decimal(0)).toString(),
          );
          const total = monthKeys.reduce(
            (s, k) => s.plus(perMonth.get(k) ?? 0),
            new Decimal(0),
          );
          return {
            code: a.code,
            name: a.name,
            values,
            totalRial: total.toString(),
          };
        });
    const income = lineOf('INCOME');
    const expense = lineOf('EXPENSE');
    const sumCol = (lines: { values: string[] }[], i: number) =>
      lines.reduce((s, l) => s.plus(l.values[i]), new Decimal(0));
    const incomeTotals = monthKeys.map((_, i) => sumCol(income, i));
    const expenseTotals = monthKeys.map((_, i) => sumCol(expense, i));
    return {
      months: monthKeys.map((k) => ({ key: k, label: months.get(k) ?? k })),
      income,
      expense,
      incomeTotals: incomeTotals.map(String),
      expenseTotals: expenseTotals.map(String),
      netProfit: incomeTotals.map((v, i) =>
        v.minus(expenseTotals[i]).toString(),
      ),
      note: 'سود/زیان ارزیابی طلا (4070/5070) جزو درآمد/هزینه منظور شده است؛ اسناد اختتامیه لحاظ نمی‌شوند',
    };
  }

  // ═══════════════════════════ مالیات و ارزش افزوده ═══════════════════════════

  async taxReport(from?: string, to?: string) {
    const { f, t } = parseRange(from, to);
    const { accounts, rootOf } = await this.accountTree();
    const groups: Record<'PAYABLE' | 'RECEIVABLE', string[]> = {
      PAYABLE: accounts.filter((a) => rootOf(a.id) === '2030').map((a) => a.id),
      RECEIVABLE: accounts
        .filter((a) => rootOf(a.id) === '1080')
        .map((a) => a.id),
    };

    const sums = async (
      ids: string[],
      range: { from?: Date; to?: Date; before?: Date },
    ) => {
      if (!ids.length) return { dr: new Decimal(0), cr: new Decimal(0) };
      const c: Prisma.Sql[] = [
        Prisma.sql`le."account_id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})`,
        Prisma.sql`je."source" <> 'CLOSING'::"JournalSource"`,
      ];
      if (range.from) c.push(Prisma.sql`je."entry_date" >= ${range.from}`);
      if (range.to) c.push(Prisma.sql`je."entry_date" <= ${range.to}`);
      if (range.before) c.push(Prisma.sql`je."entry_date" < ${range.before}`);
      const r = await this.prisma.$queryRaw<
        { dr: Prisma.Decimal | null; cr: Prisma.Decimal | null }[]
      >`
        SELECT SUM(CASE WHEN le."side" = 'DEBIT' THEN le."amount_rial" ELSE 0 END) AS dr,
               SUM(CASE WHEN le."side" = 'CREDIT' THEN le."amount_rial" ELSE 0 END) AS cr
        FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
        WHERE ${Prisma.join(c, ' AND ')}`;
      return { dr: toDecimal(r[0]?.dr), cr: toDecimal(r[0]?.cr) };
    };

    const build = async (kind: 'PAYABLE' | 'RECEIVABLE') => {
      const ids = groups[kind];
      const opening = f
        ? await sums(ids, { before: f })
        : { dr: new Decimal(0), cr: new Decimal(0) };
      const period = await sums(ids, { from: f, to: t });
      const nat = (x: { dr: Decimal; cr: Decimal }) =>
        kind === 'PAYABLE' ? x.cr.minus(x.dr) : x.dr.minus(x.cr);
      const openingBal = nat(opening);
      return {
        openingRial: openingBal.toString(),
        increaseRial: (kind === 'PAYABLE' ? period.cr : period.dr).toString(),
        decreaseRial: (kind === 'PAYABLE' ? period.dr : period.cr).toString(),
        closingRial: openingBal.plus(nat(period)).toString(),
      };
    };
    const payable = await build('PAYABLE');
    const receivable = await build('RECEIVABLE');

    // منشأ مالیات دوره (به تفکیک نوع عملیات سند)
    let bySource: {
      referenceType: string | null;
      source: string;
      amountRial: string;
    }[] = [];
    if (groups.PAYABLE.length) {
      const c: Prisma.Sql[] = [
        Prisma.sql`le."account_id" IN (${Prisma.join(groups.PAYABLE.map((id) => Prisma.sql`${id}::uuid`))})`,
        Prisma.sql`le."side" = 'CREDIT'`,
      ];
      if (f) c.push(Prisma.sql`je."entry_date" >= ${f}`);
      if (t) c.push(Prisma.sql`je."entry_date" <= ${t}`);
      const rows = await this.prisma.$queryRaw<
        {
          reference_type: string | null;
          source: string;
          amount: Prisma.Decimal | null;
        }[]
      >`
        SELECT je."reference_type", je."source"::text AS source, SUM(le."amount_rial") AS amount
        FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
        WHERE ${Prisma.join(c, ' AND ')}
        GROUP BY 1, 2 ORDER BY 3 DESC`;
      bySource = rows.map((r) => ({
        referenceType: r.reference_type,
        source: r.source,
        amountRial: toDecimal(r.amount).toString(),
      }));
    }

    return {
      from: f?.toISOString() ?? null,
      to: t?.toISOString() ?? null,
      payable,
      receivable,
      netPayableRial: new Decimal(payable.closingRial)
        .minus(receivable.closingRial)
        .toString(),
      bySource,
      note: 'مالیات پرداختنی (2030) از معاملات و فروش‌ها و اعتبار مالیات خرید (1080) از خریدهای خزانه؛ پرداخت به اداره‌ی مالیات با سند دستی بدهکار 2030 ثبت شود',
    };
  }
}
