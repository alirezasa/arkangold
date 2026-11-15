// api/src/zarpayesh/zarpayesh-shop-order.integration.spec.ts
//
// «ارسال دارایی» سامانه ناظر برای سفارش تحویل شمش با طلای آب‌شده، روی PostgreSQL واقعی و سرور
// شبیه‌سازی‌شده‌ی زر پایش، با سرویس واقعی ارسال/تحویل فروشگاه:
//   خاموش → روند کد تحویل آرکان مثل قبل
//   روشن: Cron ← MakeDeliveries (میلی‌گرم) ← ارسال (۲ و ۳، بدون کد آرکان) ← کد نادرست (شمارش تلاش)
//         ← کد پیامک زر پایش (Approve ۱) ← تحویل؛ کد تأیید در لاگ ذخیره نمی‌شود
//   ثبت ناموفق مانع ارسال است ← «ادامه بدون ثبت» ← کد آرکان؛ لغو سفارش ← SetDeliveries ۴
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest --runInBand zarpayesh-shop-order
// (با zarpayesh-trade.integration هم‌زمان اجرا نشود: هر دو ردیف تنظیمات zarpayesh_config را تغییر می‌دهند)
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import type { ProviderCredentialService } from '../integrations/credentials/provider-credential.service';
import type { CredentialEncryptionService } from '../integrations/credentials/credential-encryption.service';
import type { SmsTemplateService } from '../notifications/sms-template.service';
import { ShopOrderEventsService } from '../shop-orders/shop-order-events.service';
import { ShopOrderFulfillmentService } from '../shop-orders/shop-order-fulfillment.service';
import { ZarPayeshConfigService } from './zarpayesh-config.service';
import { ZarPayeshApiLogService } from './zarpayesh-api-log.service';
import { ZarPayeshClientService } from './zarpayesh-client.service';
import { ZarPayeshUsersService } from './zarpayesh-users.service';
import { ZarPayeshShopOrderService } from './zarpayesh-shop-order.service';
import {
  FAKE_AES_KEY,
  FakeZarPayeshServer,
} from './fake-zarpayesh-server.helper-spec';
import { ZARPAYESH_INSECURE_FLAG } from './zarpayesh.constants';

const url = process.env.INTEGRATION_DATABASE_URL;
const ADMIN = randomUUID();
const run = url ? describe : describe.skip;

function nationalCode(): string {
  const base = String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9);
  const d = base.split('').map(Number);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += d[i] * (10 - i);
  const r = sum % 11;
  return base + String(r < 2 ? r : 11 - r);
}

run('سامانه ناظر (زر پایش) — سفارش تحویل شمش (PostgreSQL)', () => {
  let prisma: PrismaService;
  let server: FakeZarPayeshServer;
  let zp: ZarPayeshShopOrderService;
  let fulfillment: ShopOrderFulfillmentService;
  let userId: string;
  let addressId: string;
  let courierMethodId: string;
  let pickupMethodId: string;
  const sms: { key: string; vars: Record<string, string> }[] = [];

  const store = new Map<string, string>();
  const redis = {
    get: (k: string) => Promise.resolve(store.get(k) ?? null),
    setex: (k: string, _t: number, v: string) => {
      store.set(k, v);
      return Promise.resolve('OK');
    },
    set: (k: string, v: string) => {
      if (store.has(k)) return Promise.resolve(null);
      store.set(k, v);
      return Promise.resolve('OK');
    },
    del: (k: string) => {
      store.delete(k);
      return Promise.resolve(1);
    },
  } as unknown as Redis;

  const setConfig = (data: Prisma.ZarPayeshConfigUpdateInput) =>
    prisma.zarPayeshConfig.update({ where: { id: 'default' }, data });

  let seq = 0;
  async function paidOrder(goldGrams: string) {
    seq += 1;
    const o = await prisma.shopOrder.create({
      data: {
        orderNumber: `SHO-ZP-${Date.now()}-${seq}`,
        userId,
        addressId,
        subtotalRial: new Prisma.Decimal(500_000_000),
        totalRial: new Prisma.Decimal(500_000_000),
        fundingSource: 'MELTED_GOLD',
        goldAppliedGrams: new Prisma.Decimal(goldGrams),
        goldAppliedRial: new Prisma.Decimal(400_000_000),
        status: 'PAID',
        paidAt: new Date(),
      },
    });
    return o.id;
  }
  const row = (orderId: string) =>
    prisma.zarPayeshDelivery.findUnique({ where: { shopOrderId: orderId } });
  const lastShipping = (orderId: string) =>
    prisma.shipping.findFirstOrThrow({
      where: { shopOrderId: orderId },
      orderBy: { createdAt: 'desc' },
    });
  const order = (orderId: string) =>
    prisma.shopOrder.findUniqueOrThrow({ where: { id: orderId } });
  const ship = (orderId: string, methodId = courierMethodId) =>
    fulfillment.ship(
      orderId,
      { shippingMethodId: methodId, courierPhone: '09121234567' },
      ADMIN,
    );

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    server = new FakeZarPayeshServer();
    // کد پیگیری یکتا بین اجراهای مختلف روی یک پایگاه داده
    server.nextDeliveryCode = 10_000_000 + Math.floor(Math.random() * 1e9);
    await server.start();
    await new SystemConfigService(prisma).onModuleInit();

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
      {
        get: (k: string, d?: string) =>
          Promise.resolve(k === ZARPAYESH_INSECURE_FLAG ? 'true' : d),
      } as unknown as SystemConfigService,
    );
    zp = new ZarPayeshShopOrderService(
      prisma,
      zpConfig,
      client,
      new ZarPayeshUsersService(prisma, client),
      redis,
    );
    const smsTemplates = {
      sendToUser: (key: string, _u: string, vars: Record<string, string>) => {
        sms.push({ key, vars });
        return Promise.resolve();
      },
    } as unknown as SmsTemplateService;
    const events = new ShopOrderEventsService(prisma, smsTemplates, encryption);
    jest.spyOn(events, 'notifyCourier').mockResolvedValue(undefined);
    fulfillment = new ShopOrderFulfillmentService(prisma, events, zp);
    await fulfillment.onModuleInit();
    const methods = await prisma.shippingMethod.findMany();
    courierMethodId = methods.find((m) => m.code === 'COURIER').id;
    pickupMethodId =
      methods.find((m) => m.type === 'PICKUP')?.id ??
      (
        await prisma.shippingMethod.create({
          data: {
            code: `PICKUP_${Date.now()}`,
            name: 'تحویل حضوری',
            type: 'PICKUP',
            requiresDeliveryCode: true,
          },
        })
      ).id;

    const user = await prisma.user.create({
      data: {
        phone: `09${String(Date.now()).slice(-9)}`,
        referralCode: `ZPS${Date.now()}`,
        identity: {
          create: {
            firstName: 'آزمون',
            lastName: 'تحویل',
            nationalCode: nationalCode(),
            birthDate: new Date('1990-03-21T00:00:00Z'),
            status: 'VERIFIED',
          },
        },
      },
    });
    userId = user.id;
    addressId = (
      await prisma.address.create({
        data: { userId, fullAddress: 'تهران، آزمون' },
      })
    ).id;
  });

  afterAll(async () => {
    await setConfig({ enabled: false, baseUrl: 'http://api.rpmms.ir' });
    await server.stop();
    await prisma.$disconnect();
  });

  it('خاموش: بدون فراخوانی سامانه ناظر و با کد تحویل آرکان', async () => {
    const id = await paidOrder('1.2345');
    await zp.registerPending();
    await ship(id);
    expect(server.requests).toHaveLength(0);
    const s = await lastShipping(id);
    expect(s.deliveryCodeSource).toBeNull();
    expect(s.deliveryCodeEnc).not.toBeNull();
    expect(await row(id)).toBeNull();
  });

  it('روشن: ثبت ← ارسال (۲، ۳) ← کد نادرست ← کد زر پایش (Approve) ← تحویل', async () => {
    await setConfig({
      enabled: true,
      baseUrl: server.baseUrl,
      timeoutMs: 3000,
      typeId: 1n,
      vaultId: 3n,
    });
    const id = await paidOrder('1.2345');
    await zp.registerPending();

    const r = await row(id);
    expect(r?.state).toBe('REQUESTED');
    expect(r?.trackingCode).not.toBeNull();
    const makeFor = () =>
      server
        .calls('/api/aure/Aurelink/MakeDeliveries')
        .filter(
          (c) =>
            String(c.body?.srcTrackingNumber) === String(r.srcTrackingNumber),
        );
    const make = makeFor();
    expect(make).toHaveLength(1);
    expect(make[0].body?.amount).toBe(1235); // ۱٫۲۳۴۵ گرم → ۱۲۳۵ میلی‌گرم (گرد)
    expect(make[0].body?.typeId).toBe(1);
    // Cron دوباره ثبت نمی‌کند
    await zp.registerPending();
    expect(makeFor()).toHaveLength(1);

    sms.length = 0;
    const shipped = await ship(id);
    expect(shipped.message).toContain('سامانه ناظر');
    const s = await lastShipping(id);
    expect(s.deliveryCodeSource).toBe('ZARPAYESH');
    expect(s.deliveryCodeEnc).toBeNull();
    expect(sms[0].vars.deliveryCode).toContain('زر پایش');
    await new Promise((res) => setTimeout(res, 300)); // afterShipped (void)
    const tracking = Number(r.trackingCode);
    expect(server.deliveries.get(tracking)?.statuses).toEqual([2, 3]);

    const view = await fulfillment.deliveryView(id, true);
    expect(view?.shipping?.deliveryCodeRequired).toBe(true);
    expect(view?.shipping?.deliveryCodeSource).toBe('ZARPAYESH');
    expect(view?.shipping?.deliveryCode).toBeNull();

    // آرکان کد جدید نمی‌سازد؛ فقط قفل را باز می‌کند
    const resend = await fulfillment.resendDeliveryCode(id, ADMIN, true);
    expect(resend.message).toContain('سامانه ناظر');

    await expect(fulfillment.deliverWithCode(id, '123', ADMIN)).rejects.toThrow(
      /کد تحویل نادرست است \(۴ تلاش/,
    );
    expect((await lastShipping(id)).deliveryCodeAttempts).toBe(1);
    expect((await order(id)).status).toBe('SHIPPED');

    const code = server.deliveries.get(tracking).approveCode;
    const persianDigits = code.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
    const done = await fulfillment.deliverWithCode(id, persianDigits, ADMIN);
    expect(done.alreadyProcessed).toBe(false);
    expect((await order(id)).status).toBe('DELIVERED');
    expect(server.deliveries.get(tracking)?.statuses).toEqual([2, 3, 1]);
    const after = await row(id);
    expect(after?.remoteStatus).toBe(1);
    expect(after?.approvedAt).not.toBeNull();

    // کد تأیید در لاگ ذخیره نمی‌شود
    const logs = await prisma.zarPayeshApiLog.findMany({
      where: {
        method: 'SetDeliveries',
        srcTrackingNumber: r.srcTrackingNumber,
      },
    });
    expect(JSON.stringify(logs.map((l) => l.requestBody))).not.toContain(code);
    expect(JSON.stringify(logs.map((l) => l.requestBody))).toContain(
      '[REDACTED]',
    );
  });

  it('تحویل حضوری: فقط ۲ ثبت می‌شود و Approve مستقیم پذیرفته می‌شود', async () => {
    const id = await paidOrder('0.5');
    await zp.registerPending();
    await ship(id, pickupMethodId);
    await new Promise((res) => setTimeout(res, 300));
    const tracking = Number((await row(id)).trackingCode);
    expect(server.deliveries.get(tracking)?.statuses).toEqual([2]);
    await fulfillment.deliverWithCode(
      id,
      server.deliveries.get(tracking).approveCode,
      ADMIN,
    );
    expect(server.deliveries.get(tracking)?.statuses).toEqual([2, 1]);
    expect((await order(id)).status).toBe('DELIVERED');
  });

  it('ثبت ناموفق مانع ارسال است؛ «ادامه بدون ثبت» با کد آرکان', async () => {
    const id = await paidOrder('2');
    server.overrides.set('/api/aure/Aurelink/MakeDeliveries', () => ({
      status: 400,
      body: {
        statusCode: 400,
        isError: true,
        message: '1052',
        responseException: null,
        result: null,
      },
    }));
    await expect(ship(id)).rejects.toThrow(/پیش از ارسال باید در سامانه ناظر/);
    expect((await row(id))?.state).toBe('FAILED');
    expect((await order(id)).status).toBe('PAID');

    await zp.skip(id, ADMIN, 'کاربر پیش از راه‌اندازی زر پایش خرید کرده است');
    server.overrides.delete('/api/aure/Aurelink/MakeDeliveries');
    await ship(id);
    const s = await lastShipping(id);
    expect(s.deliveryCodeSource).toBeNull();
    expect(s.deliveryCodeEnc).not.toBeNull();
    expect((await row(id))?.state).toBe('SKIPPED');
  });

  it('لغو سفارش ثبت‌شده → SetDeliveries ۴', async () => {
    const id = await paidOrder('1');
    await zp.registerPending();
    const tracking = Number((await row(id)).trackingCode);
    await zp.cancel(id, ADMIN);
    expect(server.deliveries.get(tracking)?.statuses).toEqual([4]);
    expect((await row(id))?.remoteStatus).toBe(4);
  });

  it('نتیجه‌ی نامشخص ثبت با MakeDeliverFollowup تعیین تکلیف می‌شود', async () => {
    const id = await paidOrder('0.75');
    // سامانه ناظر ثبت می‌کند ولی پاسخ دیر می‌رسد (Timeout)
    server.overrides.set('/api/aure/Aurelink/MakeDeliveries', () => null);
    await setConfig({ timeoutMs: 1 });
    await zp.registerPending();
    await setConfig({ timeoutMs: 3000 });
    server.overrides.delete('/api/aure/Aurelink/MakeDeliveries');
    const pending = await row(id);
    expect(pending?.state).toBe('REQUESTING');
    await prisma.zarPayeshDelivery.update({
      where: { id: pending.id },
      data: { updatedAt: new Date(Date.now() - 120_000) },
    });
    await new Promise((res) => setTimeout(res, 200));
    await zp.registerPending();
    const r = await row(id);
    expect(r?.state).toBe('REQUESTED');
    // ثبت دوباره انجام نشد (همان مرسوله‌ی قبلی پیدا شد)
    const srcs = [...server.deliveries.values()].filter(
      (d) => d.src === String(pending.srcTrackingNumber),
    );
    expect(srcs).toHaveLength(1);
  });
});
