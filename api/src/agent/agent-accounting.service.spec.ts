// api/src/agent/agent-accounting.service.spec.ts
//
// اسناد نمایندگان با AccountingService واقعی (همان منطق توازن و اثر بر مانده‌ها)
// روی یک tx درون‌حافظه‌ای آزموده می‌شوند.
import Decimal from 'decimal.js';
import { AccountingService } from '../accounting/accounting.service';
import { CHART_OF_ACCOUNTS_DEFAULTS } from '../accounting/accounts.seed';
import { AgentAccountingService } from './agent-accounting.service';

type Side = 'DEBIT' | 'CREDIT';

interface LedgerRow {
  accountId: string;
  side: Side;
  amountRial: Decimal;
  amountGrams: Decimal;
}

function createFakeTx() {
  const balances = new Map<string, { rial: Decimal; grams: Decimal }>(
    CHART_OF_ACCOUNTS_DEFAULTS.map((a) => [
      a.code,
      { rial: new Decimal(0), grams: new Decimal(0) },
    ]),
  );
  const journals: { id: string; lines: LedgerRow[] }[] = [];
  const agent = { balanceRial: new Decimal(0) };
  const agentLedger: {
    debitRial: string;
    creditRial: string;
    balanceAfterRial: string;
  }[] = [];

  const tx = {
    account: {
      findMany: ({ where }: { where: { code: { in: string[] } } }) =>
        Promise.resolve(
          CHART_OF_ACCOUNTS_DEFAULTS.filter((a) =>
            where.code.in.includes(a.code),
          ).map((a) => ({ ...a, id: a.code, balanceRial: 0, balanceGrams: 0 })),
        ),
      update: ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          balanceRial: { increment: Decimal };
          balanceGrams: { increment: Decimal };
        };
      }) => {
        const b = balances.get(where.id);
        b.rial = b.rial.plus(data.balanceRial.increment);
        b.grams = b.grams.plus(data.balanceGrams.increment);
        return Promise.resolve({});
      },
    },
    journalEntry: {
      create: () => {
        const j = { id: `J${journals.length + 1}`, lines: [] as LedgerRow[] };
        journals.push(j);
        return Promise.resolve({ id: j.id });
      },
    },
    ledgerEntry: {
      createMany: ({
        data,
      }: {
        data: (LedgerRow & { journalEntryId: string })[];
      }) => {
        journals
          .find((j) => j.id === data[0].journalEntryId)
          .lines.push(...data);
        return Promise.resolve({ count: data.length });
      },
    },
    $executeRaw: () => Promise.resolve(1),
    agent: {
      findUnique: () =>
        Promise.resolve({ balanceRial: agent.balanceRial.toFixed(0) }),
      update: ({ data }: { data: { balanceRial: string } }) => {
        agent.balanceRial = new Decimal(data.balanceRial);
        return Promise.resolve({});
      },
    },
    agentLedgerEntry: {
      create: ({
        data,
      }: {
        data: {
          debitRial: string;
          creditRial: string;
          balanceAfterRial: string;
        };
      }) => {
        agentLedger.push(data);
        return Promise.resolve({ id: `L${agentLedger.length}`, ...data });
      },
    },
  };

  const bal = (code: string) => balances.get(code);
  return { tx, journals, bal, agent, agentLedger };
}

function assertBalanced(lines: LedgerRow[]) {
  const sum = (side: Side, key: 'amountRial' | 'amountGrams') =>
    lines
      .filter((l) => l.side === side)
      .reduce((s, l) => s.plus(l[key]), new Decimal(0));
  expect(sum('DEBIT', 'amountRial').equals(sum('CREDIT', 'amountRial'))).toBe(
    true,
  );
  expect(sum('DEBIT', 'amountGrams').equals(sum('CREDIT', 'amountGrams'))).toBe(
    true,
  );
}

describe('AgentAccountingService', () => {
  const accounting = new AccountingService({} as never);
  const service = new AgentAccountingService(accounting);

  const sale = {
    agentTag: '[AGT-0001]',
    saleNumber: 'AG-1404-AGS-000001',
    hologramCode: '12345678',
    weightGrams: new Decimal('10'),
    goldValueRial: new Decimal('800000000'),
    premiumRial: new Decimal('20000000'),
    commissionRial: new Decimal('8200000'),
    netPayableRial: new Decimal('811800000'),
  };

  it('ثبت کامل چرخه: تحویل امانی → فروش → ابطال → فروش مجدد → تسویه → اصلاحیه', async () => {
    const { tx, journals, bal, agent, agentLedger } = createFakeTx();
    const t = tx as never;

    // تحویل امانی ۱۰ گرم
    await service.journalStockMovement(t, {
      agentTag: '[AGT-0001]',
      agentName: 'طلافروشی نمونه',
      voucherNumber: 'AG-1404-AGV-000001',
      totalGrams: new Decimal(10),
      count: 1,
      direction: 'ALLOCATION',
    });
    expect(bal('1030').grams.toNumber()).toBe(10);
    expect(bal('1020').grams.toNumber()).toBe(-10);

    // فروش
    await service.journalSale(t, sale);
    await service.postLedger(t, {
      agentId: 'a',
      type: 'SALE',
      debitRial: sale.netPayableRial,
      description: 'فروش',
    });
    expect(bal('1030').grams.toNumber()).toBe(0);
    expect(bal('5050').grams.toNumber()).toBe(10);
    expect(bal('1040').rial.toString()).toBe('811800000');
    expect(bal('5040').rial.toString()).toBe('8200000');
    expect(bal('4040').rial.toString()).toBe('800000000');
    expect(bal('4050').rial.toString()).toBe('20000000');
    expect(agent.balanceRial.toString()).toBe('811800000');

    // ابطال: همه‌ی اثرها برمی‌گردد و شمش دوباره امانی است
    await service.journalSale(t, sale, true);
    await service.postLedger(t, {
      agentId: 'a',
      type: 'SALE_VOID',
      creditRial: sale.netPayableRial,
      description: 'ابطال',
    });
    expect(bal('1030').grams.toNumber()).toBe(10);
    for (const code of ['1040', '5040', '4040', '4050']) {
      expect(bal(code).rial.isZero()).toBe(true);
    }
    expect(agent.balanceRial.isZero()).toBe(true);

    // فروش مجدد و تسویه‌ی بخشی از بدهی
    await service.journalSale(t, sale);
    await service.postLedger(t, {
      agentId: 'a',
      type: 'SALE',
      debitRial: sale.netPayableRial,
      description: 'فروش',
    });
    await service.journalSettlement(t, {
      agentTag: '[AGT-0001]',
      settlementNumber: 'AG-1404-AGP-000001',
      amountRial: new Decimal('500000000'),
      methodLabel: 'واریز بانکی',
    });
    await service.postLedger(t, {
      agentId: 'a',
      type: 'SETTLEMENT',
      creditRial: new Decimal('500000000'),
      description: 'تسویه',
    });
    expect(bal('1010').rial.toString()).toBe('500000000');
    expect(bal('1040').rial.toString()).toBe('311800000');
    expect(agent.balanceRial.toString()).toBe('311800000');

    // اصلاحیه‌ها: کاهش و افزایش بدهی
    await service.journalAdjustment(t, {
      agentTag: '[AGT-0001]',
      number: 'AG-1404-AGJ-000001',
      amountRial: new Decimal('1800000'),
      direction: 'DECREASE',
      reason: 'پاداش فروش ماهانه',
    });
    await service.journalAdjustment(t, {
      agentTag: '[AGT-0001]',
      number: 'AG-1404-AGJ-000002',
      amountRial: new Decimal('500000'),
      direction: 'INCREASE',
      reason: 'جریمه تأخیر در تسویه',
    });
    expect(bal('1040').rial.toString()).toBe('310500000');
    expect(bal('4060').rial.toString()).toBe('500000');
    expect(bal('5040').rial.toString()).toBe('10000000');

    // مانده‌ی دفتر معین نماینده با مانده‌ی ردیف آخر یکی است
    expect(agentLedger[agentLedger.length - 1].balanceAfterRial).toBe(
      '311800000',
    );

    // هر سند متوازن و همه‌ی حساب‌ها معتبرند
    for (const j of journals) assertBalanced(j.lines);
    expect(journals).toHaveLength(7);
  });

  it('فروش بدون حق‌العمل و اجرت سطر صفر نمی‌سازد', async () => {
    const { tx, journals } = createFakeTx();
    await service.journalSale(tx as never, {
      ...sale,
      premiumRial: new Decimal(0),
      commissionRial: new Decimal(0),
      netPayableRial: new Decimal('800000000'),
    });
    const accounts = journals[0].lines.map((l) => l.accountId).sort();
    expect(accounts).toEqual(['1030', '1040', '4040', '5050']);
    assertBalanced(journals[0].lines);
  });
});
