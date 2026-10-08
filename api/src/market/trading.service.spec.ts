// api/src/market/trading.service.spec.ts
//
// مسیر خرید/فروش طلای آب‌شده با Prisma و تنظیمات درون‌حافظه‌ای: قیمت کهنه، کارمزد
// قفل‌شده در پیش‌فاکتور، موجودی بلوکه‌شده و خاموش بودن خدمت.
import { Prisma } from '../generated/prisma/client';
import { TradingService } from './trading.service';
import type { PriceService } from './price.service';
import type { SystemConfigService } from '../system-config/system-config.service';
import type { AccountingService } from '../accounting/accounting.service';
import type { PrismaService } from '../prisma/prisma.service';
import {
  startOfJalaliMonthTehran,
  startOfTehranDay,
} from '../common/utils/jalali.util';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);
const PRICE = D(100_000_000); // ریال هر گرم
const LOCK_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

function setup(opts: {
  config?: Record<string, string>;
  fetchedAgoSec?: number;
  disableBuy?: boolean;
  wallet?: { rial: number; grams: number };
  holds?: { rial?: number; grams?: number };
}) {
  const config: Record<string, string> = {
    'fee.buy_gold': '1',
    'fee.sell_gold': '1',
    ...opts.config,
  };
  const systemConfig = {
    getDecimal: (k: string, f: string) => Promise.resolve(D(config[k] ?? f)),
    getNumber: (k: string, f: number) =>
      Promise.resolve(config[k] ? Number(config[k]) : f),
    getBoolean: (k: string, f: boolean) =>
      Promise.resolve(config[k] ? config[k] === 'true' : f),
  } as unknown as SystemConfigService;

  const priceService = {
    getTradableGoldQuote: () =>
      Promise.resolve({
        priceRial: PRICE,
        fetchedAt: new Date(Date.now() - (opts.fetchedAgoSec ?? 5) * 1000),
        disableBuy: opts.disableBuy ?? false,
        disableSell: false,
      }),
  } as unknown as PriceService;

  const locks = new Map<string, Record<string, unknown>>();
  const wallet = {
    id: 'w1',
    userId: USER_ID,
    rialBalance: D(opts.wallet?.rial ?? 0),
    goldBalanceGrams: D(opts.wallet?.grams ?? 0),
  };
  const created: { orders: unknown[]; transactions: unknown[] } = {
    orders: [],
    transactions: [],
  };

  const tx = {
    $executeRaw: () => Promise.resolve(1),
    priceLock: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(locks.get(where.id) ?? null),
      update: ({ where }: { where: { id: string } }) => {
        const lock = locks.get(where.id);
        if (lock) lock.used = true;
        return Promise.resolve({});
      },
    },
    order: {
      findFirst: () => Promise.resolve(null),
      create: ({ data }: { data: Record<string, unknown> }) => {
        const o = { id: 'o1', ...data };
        created.orders.push(o);
        return Promise.resolve(o);
      },
    },
    wallet: {
      findUnique: () => Promise.resolve(wallet),
      update: ({
        data,
      }: {
        data: {
          rialBalance: {
            increment?: Prisma.Decimal;
            decrement?: Prisma.Decimal;
          };
          goldBalanceGrams: {
            increment?: Prisma.Decimal;
            decrement?: Prisma.Decimal;
          };
        };
      }) => {
        const r = data.rialBalance;
        const g = data.goldBalanceGrams;
        wallet.rialBalance = wallet.rialBalance
          .plus(r.increment ?? 0)
          .minus(r.decrement ?? 0);
        wallet.goldBalanceGrams = wallet.goldBalanceGrams
          .plus(g.increment ?? 0)
          .minus(g.decrement ?? 0);
        return Promise.resolve(wallet);
      },
    },
    walletHold: {
      aggregate: () =>
        Promise.resolve({
          _sum: {
            amountRial: opts.holds?.rial != null ? D(opts.holds.rial) : null,
            amountGrams: opts.holds?.grams != null ? D(opts.holds.grams) : null,
          },
        }),
    },
    transaction: {
      aggregate: () => Promise.resolve({ _sum: { amountGrams: null } }),
      create: ({ data }: { data: Record<string, unknown> }) => {
        created.transactions.push(data);
        return Promise.resolve({ id: `t${created.transactions.length}` });
      },
    },
  };

  const prisma = {
    ...tx,
    user: {
      findUnique: () =>
        Promise.resolve({
          status: 'ACTIVE',
          identity: { status: 'VERIFIED' },
        }),
    },
    priceLock: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        const lock = { id: LOCK_ID, createdAt: new Date(), ...data };
        locks.set(LOCK_ID, lock);
        return Promise.resolve(lock);
      },
    },
    order: { findFirst: () => Promise.resolve(null) },
    $transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;

  const postJournal = jest.fn(() => Promise.resolve({ id: 'j1' }));
  const accounting = { postJournal } as unknown as AccountingService;

  const service = new TradingService(
    prisma,
    priceService,
    systemConfig,
    accounting,
  );
  return { service, config, wallet, locks, created, postJournal };
}

describe('TradingService — طلای آب‌شده', () => {
  it('خرید: مبلغ کسرشده دقیقاً برابر پیش‌فاکتور (با کارمزد) است', async () => {
    const { service, wallet } = setup({
      wallet: { rial: 200_000_000, grams: 0 },
    });
    const lock = await service.lockPrice(USER_ID, 'BUY', 1.5);
    expect(lock.totalRial).toBe('150000000');
    expect(lock.feeRial).toBe('1500000');
    expect(lock.totalPayableRial).toBe('151500000');

    const order = await service.createOrder(USER_ID, lock.lockId);
    expect(order.netToman).toBe('15150000');
    expect(wallet.rialBalance.toString()).toBe('48500000');
    expect(wallet.goldBalanceGrams.toString()).toBe('1.5');
  });

  it('تغییر کارمزد بین قفل و تأیید، مبلغ پیش‌فاکتور را تغییر نمی‌دهد', async () => {
    const { service, config, wallet } = setup({
      wallet: { rial: 200_000_000, grams: 0 },
    });
    const lock = await service.lockPrice(USER_ID, 'BUY', 1);
    config['fee.buy_gold'] = '5';
    await service.createOrder(USER_ID, lock.lockId);
    expect(wallet.rialBalance.toString()).toBe(
      String(200_000_000 - 101_000_000),
    );
  });

  it('مقدار گرم رو به پایین گرد می‌شود (هرگز بیشتر از درخواست نیست)', async () => {
    const { service } = setup({});
    const lock = await service.lockPrice(USER_ID, 'SELL', 1.23459);
    expect(lock.amountGrams).toBe('1.2345');
  });

  it('قیمت کهنه (قطعی منبع قیمت) قفل نمی‌شود', async () => {
    const { service } = setup({ fetchedAgoSec: 600 });
    await expect(service.lockPrice(USER_ID, 'BUY', 1)).rejects.toThrow(
      'قیمت بازار در حال به‌روزرسانی است',
    );
  });

  it('توقف خرید از سوی منبع قیمت رعایت می‌شود و قابل خاموش کردن است', async () => {
    await expect(
      setup({ disableBuy: true }).service.lockPrice(USER_ID, 'BUY', 1),
    ).rejects.toThrow('بسته بودن بازار');
    await expect(
      setup({
        disableBuy: true,
        config: { 'trade.gold.respect_source_disable': 'false' },
      }).service.lockPrice(USER_ID, 'BUY', 1),
    ).resolves.toBeDefined();
  });

  it('خدمت غیرفعال در پنل ادمین، قفل قیمت را رد می‌کند', async () => {
    const { service } = setup({
      config: { 'service.melted_gold.enabled': 'false' },
    });
    await expect(service.lockPrice(USER_ID, 'BUY', 1)).rejects.toThrow(
      'غیرفعال',
    );
  });

  it('خرید: ریال بلوکه‌شده (برداشت در انتظار) قابل خرج نیست', async () => {
    const { service } = setup({
      wallet: { rial: 110_000_000, grams: 0 },
      holds: { rial: 50_000_000 },
    });
    const lock = await service.lockPrice(USER_ID, 'BUY', 1);
    await expect(service.createOrder(USER_ID, lock.lockId)).rejects.toThrow(
      'موجودی قابل استفاده کافی نیست',
    );
  });

  it('فروش: طلای بلوکه‌شده (تحویل فیزیکی) قابل فروش نیست', async () => {
    const { service, wallet } = setup({
      wallet: { rial: 0, grams: 2 },
      holds: { grams: 1.5 },
    });
    const lock = await service.lockPrice(USER_ID, 'SELL', 1);
    await expect(service.createOrder(USER_ID, lock.lockId)).rejects.toThrow(
      'موجودی طلای قابل استفاده کافی نیست',
    );
    expect(wallet.goldBalanceGrams.toString()).toBe('2');
  });

  it('فروش: مبلغ واریزی = ارزش طلا منهای کارمزد', async () => {
    const { service, wallet, postJournal } = setup({
      wallet: { rial: 0, grams: 2 },
    });
    const lock = await service.lockPrice(USER_ID, 'SELL', 2);
    const order = await service.createOrder(USER_ID, lock.lockId);
    expect(order.netToman).toBe('19800000');
    expect(wallet.rialBalance.toString()).toBe('198000000');
    expect(wallet.goldBalanceGrams.toString()).toBe('0');
    expect(postJournal).toHaveBeenCalledTimes(1);
  });
});

describe('مرزهای زمانی تهران', () => {
  it('شروع روز به وقت تهران (UTC+03:30)', () => {
    // ۲۳:۰۰ UTC = ۰۲:۳۰ بامداد روز بعد در تهران
    const d = startOfTehranDay(new Date('2026-10-07T23:00:00Z'));
    expect(d.toISOString()).toBe('2026-10-07T20:30:00.000Z');
  });

  it('شروع ماه شمسی (۱ مهر ۱۴۰۵ = ۲۳ سپتامبر ۲۰۲۶)', () => {
    const d = startOfJalaliMonthTehran(new Date('2026-10-08T10:00:00Z'));
    expect(d.toISOString()).toBe('2026-09-22T20:30:00.000Z');
  });
});
