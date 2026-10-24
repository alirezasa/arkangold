// api/src/zarpayesh/zarpayesh-trade.integration.spec.ts
//
// جریان کامل معامله‌ی طلای آب‌شده با سامانه ناظر روی PostgreSQL واقعی و سرور شبیه‌سازی‌شده‌ی زر پایش:
//   خاموش (پیش‌فرض) ← روشن: ثبت کاربر + Reserve + Approve داخل تراکنش ← رد Approve (rollback و Cancel)
//   ← Timeout در Approve با تأیید واقعی (تشخیص با TxnFollowup) ← رد Reserve ← پیگیری خودکار رزرو رهاشده
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest zarpayesh-trade
// بدون این متغیر آزمون رد (skip) می‌شود.
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { TradingService } from '../market/trading.service';
import type { PriceService } from '../market/price.service';
import type { ProviderCredentialService } from '../integrations/credentials/provider-credential.service';
import type { CredentialEncryptionService } from '../integrations/credentials/credential-encryption.service';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import { ZarPayeshApiLogService } from './zarpayesh-api-log.service';
import { ZarPayeshClientService } from './zarpayesh-client.service';
import { ZarPayeshUsersService } from './zarpayesh-users.service';
import { ZarPayeshTradeService } from './zarpayesh-trade.service';
import { zarPayeshDecrypt } from './zarpayesh-crypto';
import {
  FAKE_AES_KEY,
  FakeZarPayeshServer,
} from './fake-zarpayesh-server.helper-spec';

const url = process.env.INTEGRATION_DATABASE_URL;
const run = url ? describe : describe.skip;
const PRICE = new Prisma.Decimal(100_000_000);

/** کد ملی معتبر یکتا (رقم کنترل) */
function nationalCode(): string {
  const base = String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9);
  const d = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * (10 - i);
  const r = sum % 11;
  return base + String(r < 2 ? r : 11 - r);
}

run('سامانه ناظر (زر پایش) — جریان معامله (PostgreSQL)', () => {
  let prisma: PrismaService;
  let server: FakeZarPayeshServer;
  let trading: TradingService;
  let zp: ZarPayeshTradeService;
  let userId: string;
  let walletId: string;
  let cid: string;

  const redisStore = new Map<string, string>();
  const redis = {
    get: (k: string) => Promise.resolve(redisStore.get(k) ?? null),
    setex: (k: string, _t: number, v: string) => {
      redisStore.set(k, v);
      return Promise.resolve('OK');
    },
    set: (k: string, v: string) => {
      if (redisStore.has(k)) return Promise.resolve(null);
      redisStore.set(k, v);
      return Promise.resolve('OK');
    },
    del: (k: string) => {
      redisStore.delete(k);
      return Promise.resolve(1);
    },
  } as unknown as Redis;

  const wallet = () =>
    prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  const setConfig = (data: Prisma.ZarPayeshConfigUpdateInput) =>
    prisma.zarPayeshConfig.update({ where: { id: 'default' }, data });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    server = new FakeZarPayeshServer();
    await server.start();

    const systemConfig = new SystemConfigService(prisma);
    await systemConfig.onModuleInit();
    const accounting = new AccountingService(prisma);
    await accounting.onModuleInit();

    const credentials = {
      getCredentials: () =>
        Promise.resolve({
          ACCOUNT: 'platform',
          PASSWORD: 'secret',
          AES_KEY: FAKE_AES_KEY,
        }),
    } as unknown as ProviderCredentialService;
    const zpConfig = new ZarPayeshConfigService(prisma, credentials);
    await zpConfig.onModuleInit();
    const encryption = {
      encrypt: (v: string) => Promise.resolve(`enc:${v}`),
      decrypt: (v: string) => Promise.resolve(v.slice(4)),
    } as unknown as CredentialEncryptionService;
    const client = new ZarPayeshClientService(
      zpConfig,
      new ZarPayeshApiLogService(prisma),
      encryption,
      redis,
    );
    const users = new ZarPayeshUsersService(prisma, client);
    zp = new ZarPayeshTradeService(prisma, zpConfig, client, users, redis);

    const priceService = {
      getTradableGoldQuote: () =>
        Promise.resolve({
          priceRial: PRICE,
          fetchedAt: new Date(),
          disableBuy: false,
          disableSell: false,
        }),
    } as unknown as PriceService;
    trading = new TradingService(
      prisma,
      priceService,
      systemConfig,
      accounting,
      zp,
    );

    cid = nationalCode();
    const user = await prisma.user.create({
      data: {
        phone: `09${String(Date.now()).slice(-9)}`,
        referralCode: `ZP${Date.now()}`,
        identity: {
          create: {
            firstName: 'آزمون',
            lastName: 'زرپایش',
            nationalCode: cid,
            birthDate: new Date('1990-03-21T00:00:00Z'),
            status: 'VERIFIED',
          },
        },
        wallet: {
          create: {
            cardNumber: `6${String(Date.now()).slice(-15)}`,
            rialBalance: new Prisma.Decimal(5_000_000_000),
          },
        },
      },
      include: { wallet: true },
    });
    userId = user.id;
    walletId = user.wallet.id;
  });

  afterAll(async () => {
    await setConfig({ enabled: false, baseUrl: 'http://api.rpmms.ir' });
    await server.stop();
    await prisma.$disconnect();
  });

  it('پیش‌فرض خاموش است و معامله بدون هیچ فراخوانی سامانه ناظر انجام می‌شود', async () => {
    const cfg = await prisma.zarPayeshConfig.findUniqueOrThrow({
      where: { id: 'default' },
    });
    expect(cfg.enabled).toBe(false);
    const lock = await trading.lockPrice(userId, 'BUY', 0.5);
    await trading.createOrder(userId, lock.lockId);
    expect(server.requests).toHaveLength(0);
  });

  it('روشن: ثبت کاربر ← Reserve (میلی‌گرم، cid رمزشده) ← Approve با rrn = شناسه‌ی سفارش', async () => {
    await setConfig({
      enabled: true,
      baseUrl: server.baseUrl,
      timeoutMs: 3000,
      typeId: 1n,
      vaultId: 3n,
    });
    const before = await wallet();
    const lock = await trading.lockPrice(userId, 'BUY', 1.23459);
    expect(lock.amountGrams).toBe('1.234');
    const order = await trading.createOrder(userId, lock.lockId);

    const reg = server.calls('/api/aure/Aurelink/AddPlatformUsers');
    expect(reg).toHaveLength(1);
    const reserve = server.calls('/api/aure/Aurelink/Reserve')[0].body;
    expect(reserve.amount).toBe(1234);
    expect(reserve.orderType).toBe(1);
    expect(reserve.typeId).toBe(1);
    expect(reserve.vaultId).toBe(3);
    expect(reserve.unitPrice).toBe(100_000_000);
    expect(reserve.totalPrice).toBe(123_400_000);
    expect(zarPayeshDecrypt(String(reserve.cid), FAKE_AES_KEY)).toBe(cid);
    const approve = server.calls('/api/aure/Aurelink/Approve')[0].body;
    expect(approve).toMatchObject({
      reserveCode: '9100000000000000001',
      orderType: 1,
      amount: 1234,
      payType: 11,
      rrn: order.orderId,
    });

    const trade = await prisma.zarPayeshTrade.findUniqueOrThrow({
      where: { orderId: order.orderId },
    });
    expect(trade.status).toBe('APPROVED');
    expect(trade.reserveCode).toBe(9100000000000000001n);
    expect(trade.referenceNumber).not.toBeNull();
    const after = await wallet();
    expect(
      after.goldBalanceGrams.minus(before.goldBalanceGrams).toString(),
    ).toBe('1.234');
    const reg2 = await prisma.zarPayeshUser.findUniqueOrThrow({
      where: { userId },
    });
    expect(reg2.status).toBe('REGISTERED');
    const logs = await prisma.zarPayeshApiLog.findMany({
      where: { srcTrackingNumber: trade.srcTrackingNumber },
    });
    expect(logs.map((l) => l.method).sort()).toEqual(['Approve', 'Reserve']);
    expect(
      JSON.stringify(logs, (_k, v: unknown) =>
        typeof v === 'bigint' ? v.toString() : v,
      ),
    ).not.toContain(cid);
  });

  it('رد Approve (۱۰۰۵): سفارش داخلی rollback، کیف پول دست‌نخورده و رزرو لغو می‌شود', async () => {
    server.overrides.set('/api/aure/Aurelink/Approve', () => ({
      status: 400,
      body: { statusCode: 400, isError: true, message: '1005', result: null },
    }));
    const before = await wallet();
    const lock = await trading.lockPrice(userId, 'BUY', 1);
    await expect(trading.createOrder(userId, lock.lockId)).rejects.toThrow(
      'موجودی شما در سامانه ناظر',
    );
    server.overrides.delete('/api/aure/Aurelink/Approve');

    const after = await wallet();
    expect(after.rialBalance.toString()).toBe(before.rialBalance.toString());
    expect(await prisma.order.count({ where: { lockId: lock.lockId } })).toBe(
      0,
    );
    const trade = await prisma.zarPayeshTrade.findFirstOrThrow({
      where: { priceLockId: lock.lockId },
    });
    expect(trade.status).toBe('CANCELLED');
    expect(trade.orderId).toBeNull();
    expect(server.calls('/api/aure/Aurelink/Cancel')).toHaveLength(1);
  });

  it('Timeout در Approve ولی تأیید واقعی در سامانه ناظر → تشخیص با TxnFollowup و ثبت سفارش', async () => {
    server.overrides.set('/api/aure/Aurelink/Approve', (req) => {
      const res = [...server.reservations.values()].find(
        (x) => String(x.reserveCode) === String(req.body?.reserveCode),
      );
      if (res) res.status = 2; // در سمت سرور تأیید شد
      return { status: 201, body: { result: {} }, delayMs: 3500 };
    });
    const lock = await trading.lockPrice(userId, 'SELL', 0.5);
    const order = await trading.createOrder(userId, lock.lockId);
    server.overrides.delete('/api/aure/Aurelink/Approve');
    const trade = await prisma.zarPayeshTrade.findUniqueOrThrow({
      where: { orderId: order.orderId },
    });
    expect(trade.status).toBe('APPROVED');
    expect(trade.orderType).toBe(2);
    expect(trade.lastFollowupAt).not.toBeNull();
  }, 20000);

  it('رد Reserve (۱۰۰۴) معامله را متوقف می‌کند', async () => {
    server.overrides.set('/api/aure/Aurelink/Reserve', () => ({
      status: 400,
      body: {
        statusCode: 400,
        isError: true,
        message: 'error 1004',
        result: null,
      },
    }));
    const lock = await trading.lockPrice(userId, 'BUY', 1);
    await expect(trading.createOrder(userId, lock.lockId)).rejects.toThrow(
      'موجودی قابل معامله‌ی آرکان گلد',
    );
    server.overrides.delete('/api/aure/Aurelink/Reserve');
    const trade = await prisma.zarPayeshTrade.findFirstOrThrow({
      where: { priceLockId: lock.lockId },
    });
    expect(trade.status).toBe('FAILED');
    expect(trade.errorCode).toBe('1004');
    expect(await prisma.order.count({ where: { lockId: lock.lockId } })).toBe(
      0,
    );
  });

  it('پیگیری خودکار: رزرو رهاشده بدون سفارش داخلی لغو می‌شود', async () => {
    const handle = await zp.reserve({
      userId,
      side: 'BUY',
      amountGrams: new Prisma.Decimal('0.1'),
      pricePerGramRial: PRICE,
      totalRial: PRICE.times('0.1'),
      description: 'رزرو رهاشده',
      source: 'ORDER',
      trigger: 'SYSTEM',
    });
    await prisma.$executeRaw`UPDATE "zarpayesh_trades" SET "updated_at" = now() - interval '5 minutes' WHERE "id" = ${handle.tradeId}::uuid`;
    await zp.reconcile();
    const t = await prisma.zarPayeshTrade.findUniqueOrThrow({
      where: { id: handle.tradeId },
    });
    expect(t.status).toBe('CANCELLED');
    expect(t.remoteStatus).toBe(3);
  });

  it('srcTrackingNumber تکراری (۱۰۳۷) با شماره‌ی بعدی دوباره ارسال می‌شود', async () => {
    let first = true;
    server.overrides.set('/api/aure/Aurelink/Reserve', () => {
      if (!first) return null;
      first = false;
      return {
        status: 400,
        body: { isError: true, statusCode: 1037, result: null },
      };
    });
    const handle = await zp.testReserve(randomUUID(), {
      userId,
      side: 'BUY',
      amountGrams: '0.01',
      pricePerGramRial: '100000000',
    });
    server.overrides.delete('/api/aure/Aurelink/Reserve');
    const calls = server.calls('/api/aure/Aurelink/Reserve').slice(-2);
    expect(calls[0].body.srcTrackingNumber).not.toBe(
      calls[1].body.srcTrackingNumber,
    );
    const t = await prisma.zarPayeshTrade.findUniqueOrThrow({
      where: { id: handle.tradeId },
    });
    expect(t.status).toBe('RESERVED');
    expect(String(t.srcTrackingNumber)).toBe(
      String(calls[1].body.srcTrackingNumber),
    );
    await zp.manualCancel(handle.tradeId, randomUUID());
  });
});
