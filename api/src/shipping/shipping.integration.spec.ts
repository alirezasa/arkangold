// api/src/shipping/shipping.integration.spec.ts
//
// آزمون یکپارچه‌ی سناریوی آدرس و ارسال روی PostgreSQL واقعی (پس از prisma migrate deploy):
//   دفترچه‌ی آدرس ← مناطق/تعرفه‌های پیش‌فرض ← گزینه‌های ارسال تهران و شیراز ← ثبت سفارش با
//   هزینه‌ی ارسال (پیش‌پرداخت) و پس‌کرایه ← پرداخت کیف پول، سند حسابداری و فاکتور ← لغو و برگشت
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest shipping.integration
// بدون این متغیر آزمون رد (skip) می‌شود.
import { randomUUID } from 'crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { AccountingService } from '../accounting/accounting.service';
import { InventoryAccountingService } from '../accounting/inventory-accounting.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { InvoiceService } from '../invoice/invoice.service';
import { DiscountService } from '../discount/discount.service';
import { PackagingService } from '../packaging/packaging.service';
import { ShopOrdersService } from '../shop-orders/shop-orders.service';
import { ShopOrderEventsService } from '../shop-orders/shop-order-events.service';
import type { ShopOrderFulfillmentService } from '../shop-orders/shop-order-fulfillment.service';
import type { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory';
import type { BrandingService } from '../branding/branding.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { FileSecurityService } from '../common/file-security/file-security.service';
import type Redis from 'ioredis';
import { AddressesService } from '../addresses/addresses.service';
import { ShippingService } from './shipping.service';

const url = process.env.INTEGRATION_DATABASE_URL;
const run = url ? describe : describe.skip;

run('آدرس و ارسال سفارش (یکپارچه با PostgreSQL)', () => {
  let prisma: PrismaService;
  let config: SystemConfigService;
  let shipping: ShippingService;
  let addresses: AddressesService;
  let orders: ShopOrdersService;
  let userId: string;
  let variantId: string;
  const suffix = randomUUID().slice(0, 8);

  const addressInput = (over: Record<string, string> = {}) => ({
    title: 'منزل',
    provinceCode: 'TEHRAN',
    city: 'تهران',
    postalCode: '1234567890',
    fullAddress: 'خیابان ولیعصر، کوچه‌ی بهار',
    plaque: '12',
    unit: '3',
    receiverName: 'گیرنده‌ی آزمون',
    receiverPhone: '09120000001',
    ...over,
  });

  const fillCart = async (unitPriceRial: number, quantity = 1) => {
    const cart = await prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        variantId,
        quantity,
        lockedUnitPriceRial: unitPriceRial,
        priceLockedAt: new Date(),
        priceExpiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    config = new SystemConfigService(prisma);
    await config.onModuleInit();
    // صدور فاکتور به اطلاعات حقوقی شرکت نیاز دارد
    for (const [key, value] of [
      ['company.national_id', '10100000000'],
      ['company.registration_number', '123456'],
      ['company.address', 'تهران'],
    ]) {
      if (!(await config.get(key))) await config.set(key, value);
    }
    const accounting = new AccountingService(prisma);
    await accounting.onModuleInit();
    const sequence = new DocumentSequenceService(prisma);
    const branding = {
      resolveDocumentImage: () => Promise.resolve(null),
    } as unknown as BrandingService;
    const invoices = new InvoiceService(prisma, config, sequence, branding);
    shipping = new ShippingService(prisma, config);
    await shipping.onModuleInit();
    addresses = new AddressesService(prisma);
    const events = new ShopOrderEventsService(prisma, null, null);
    jest.spyOn(events, 'notify').mockResolvedValue(undefined);
    const fulfillment = {
      deliveryView: () => Promise.resolve(null),
    } as unknown as ShopOrderFulfillmentService;
    orders = new ShopOrdersService(
      prisma,
      {} as Redis,
      {} as PaymentGatewayFactory,
      config,
      accounting,
      invoices,
      new DiscountService(prisma, {} as NotificationsService),
      new PackagingService(prisma, config, {} as FileSecurityService),
      new InventoryAccountingService(accounting),
      sequence,
      events,
      fulfillment,
      shipping,
    );

    const user = await prisma.user.create({
      data: {
        phone: `0919${String(Date.now()).slice(-7)}`,
        referralCode: `T${suffix}`,
      },
    });
    userId = user.id;
    await prisma.wallet.create({
      data: {
        userId,
        rialBalance: 10_000_000_000,
        cardNumber: `6219${String(Date.now()).slice(-12)}`,
      },
    });
    const category = await prisma.productCategory.create({
      data: { name: `شمش ${suffix}`, slug: `bars-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `شمش آزمون ${suffix}`,
        slug: `bar-${suffix}`,
        categoryId: category.id,
        basePriceRial: 0,
        status: 'ACTIVE',
      },
    });
    const variant = await prisma.productVariant.create({
      data: { productId: product.id, weightGrams: 10, stockQuantity: 50 },
    });
    variantId = variant.id;
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('دفترچه‌ی آدرس: اعتبارسنجی، پیش‌فرض، ویرایش و حذف نرم', async () => {
    await expect(
      addresses.create(userId, addressInput({ provinceCode: 'NOPE' })),
    ).rejects.toThrow('استان');
    await expect(
      addresses.create(userId, addressInput({ receiverPhone: '0912' })),
    ).rejects.toThrow();

    const home = await addresses.create(userId, addressInput());
    expect(home.isDefault).toBe(true);
    expect(home.province).toBe('تهران');

    const shiraz = await addresses.create(
      userId,
      addressInput({ title: 'شیراز', provinceCode: 'FARS', city: 'شیراز' }),
    );
    expect(shiraz.isDefault).toBe(false);

    await addresses.setDefault(userId, shiraz.id);
    let list = await addresses.list(userId);
    expect(list[0].id).toBe(shiraz.id);
    expect(list.filter((a) => a.isDefault)).toHaveLength(1);

    const edited = await addresses.update(userId, home.id, { unit: '7' });
    expect(edited.unit).toBe('7');

    const temp = await addresses.create(
      userId,
      addressInput({ title: 'موقت' }),
    );
    await addresses.remove(userId, temp.id);
    list = await addresses.list(userId);
    expect(list.some((a) => a.id === temp.id)).toBe(false);
    await expect(addresses.getOwned(userId, temp.id)).rejects.toThrow(
      'آدرس یافت نشد',
    );
  });

  it('گزینه‌های ارسال: تهران پیک دارد، شیراز فقط پست/تیپاکس/حضوری', async () => {
    await fillCart(500_000_000);
    const [home, shiraz] = (await addresses.list(userId)).sort((a) =>
      a.city === 'تهران' ? -1 : 1,
    );

    const tehran = await shipping.optionsForCart(userId, home.id);
    const tehranCodes = tehran.options.map((o) => o.code);
    expect(tehranCodes).toContain('COURIER');
    expect(tehranCodes).toContain('PICKUP');

    const fars = await shipping.optionsForCart(userId, shiraz.id);
    const farsCodes = fars.options.map((o) => o.code);
    expect(farsCodes).not.toContain('COURIER');
    expect(farsCodes).toEqual(
      expect.arrayContaining([
        'POST_SEFARESHI',
        'POST_PISHTAZ',
        'EXPRESS',
        'PICKUP',
      ]),
    );
    const pishtaz = fars.options.find((o) => o.code === 'POST_PISHTAZ');
    expect(pishtaz.zoneName).toBe('سایر استان‌ها');
    expect(Number(pishtaz.feeToman)).toBeGreaterThan(0);
    // وزن = ۱۰ گرم شمش + وزن بسته‌بندی پیش‌فرض
    expect(fars.weightGrams).toBe(310);
  });

  it('ثبت سفارش شیراز با پست پیشتاز: هزینه‌ی ارسال در مبلغ، سند و فاکتور؛ لغو آن را برمی‌گرداند', async () => {
    await fillCart(500_000_000);
    const shiraz = (await addresses.list(userId)).find(
      (a) => a.city === 'شیراز',
    );
    const { options } = await shipping.optionsForCart(userId, shiraz.id);
    const pishtaz = options.find((o) => o.code === 'POST_PISHTAZ');
    const feeRial = Number(pishtaz.feeToman) * 10;

    await expect(
      orders.checkout(userId, { addressId: shiraz.id }),
    ).rejects.toThrow('روش ارسال');
    await expect(
      orders.checkout(userId, {
        addressId: shiraz.id,
        shippingMethodId: options.find((o) => o.code === 'POST_PISHTAZ')
          .methodId,
        shippingFeePayment: 'ON_DELIVERY',
      }),
    ).rejects.toThrow('پس‌کرایه');

    const order = await orders.checkout(userId, {
      addressId: shiraz.id,
      shippingMethodId: pishtaz.methodId,
    });
    expect(Number(order.shippingToman) * 10).toBe(feeRial);
    expect(Number(order.totalToman) * 10).toBe(500_000_000 + feeRial);
    expect(order.shippingMethod?.name).toBe('پست پیشتاز');
    expect((order.address as { city: string }).city).toBe('شیراز');

    // ویرایش آدرس بعد از ثبت، snapshot سفارش را تغییر نمی‌دهد
    await addresses.update(userId, shiraz.id, {
      fullAddress: 'نشانی کاملاً جدید پس از سفارش',
    });
    const again = await orders.getOne(userId, order.id);
    expect((again.address as { fullAddress: string }).fullAddress).toBe(
      'خیابان ولیعصر، کوچه‌ی بهار',
    );

    await orders.pay(userId, order.id, { mode: 'WALLET' });
    const entry = await prisma.journalEntry.findFirst({
      where: {
        description: { contains: order.id },
        ledgerEntries: { some: { account: { code: '4035' } } },
      },
      include: { ledgerEntries: { include: { account: true } } },
    });
    const shippingLine = entry?.ledgerEntries.find(
      (l) => l.account.code === '4035',
    );
    expect(Number(shippingLine?.amountRial)).toBe(feeRial);

    const invoice = await prisma.invoice.findFirst({
      where: { sourceType: 'SHOP_ORDER', sourceId: order.id },
      include: { items: true },
    });
    const shipRow = invoice?.items.find((i) => i.productCode === 'SHIP');
    expect(Number(shipRow?.totalRial)).toBe(feeRial);

    await orders.adminCancel(order.id, { reason: 'آزمون' });
    const refund = await prisma.journalEntry.findFirst({
      where: {
        description: {
          contains: `بازگشت وجه سفارش لغوشده - سفارش ${order.id}`,
        },
      },
      include: { ledgerEntries: { include: { account: true } } },
    });
    const reversed = refund?.ledgerEntries.find(
      (l) => l.account.code === '4035',
    );
    expect(reversed?.side).toBe('DEBIT');
    expect(Number(reversed?.amountRial)).toBe(feeRial);
  });

  it('پس‌کرایه: هزینه در سفارش صفر و برآورد برای پرداخت هنگام تحویل ذخیره می‌شود', async () => {
    await fillCart(500_000_000);
    const shiraz = (await addresses.list(userId)).find(
      (a) => a.city === 'شیراز',
    );
    const { options } = await shipping.optionsForCart(userId, shiraz.id);
    const tipax = options.find((o) => o.code === 'EXPRESS');
    expect(tipax.feePayment).toBe('CUSTOMER_CHOICE');

    const order = await orders.checkout(userId, {
      addressId: shiraz.id,
      shippingMethodId: tipax.methodId,
      shippingFeePayment: 'ON_DELIVERY',
    });
    expect(Number(order.shippingToman)).toBe(0);
    expect(Number(order.totalToman) * 10).toBe(500_000_000);
    expect(order.shippingMethod?.payOnDelivery).toBe(true);
    expect(order.shippingMethod?.estimateToman).toBe(tipax.feeToman);
    await orders.cancelByUser(userId, order.id);
  });

  it('آدرس قدیمی با استان نامشخص: گزینه‌ای نمایش داده نمی‌شود و ثبت سفارش خطای روشن می‌دهد', async () => {
    const legacy = await prisma.address.create({
      data: {
        userId,
        province: 'نامشخص',
        city: 'شیراز',
        fullAddress: 'آدرس قدیمی ثبت‌شده با استان متنی',
      },
    });
    const res = await shipping.optionsForCart(userId, legacy.id);
    expect(res.provinceResolved).toBe(false);
    expect(res.options).toHaveLength(0);

    await fillCart(500_000_000);
    await expect(
      orders.checkout(userId, { addressId: legacy.id }),
    ).rejects.toThrow('استان این آدرس مشخص نیست');
    await prisma.address.delete({ where: { id: legacy.id } });
  });

  it('ارسال رایگان بالای آستانه و غیرفعال شدن انتخاب ارسال از تنظیمات', async () => {
    const shiraz = (await addresses.list(userId)).find(
      (a) => a.city === 'شیراز',
    );
    const { options } = await shipping.optionsForCart(userId, shiraz.id);
    const sefareshi = options.find((o) => o.code === 'POST_SEFARESHI');
    const rate = await prisma.shippingRate.findFirstOrThrow({
      where: { methodId: sefareshi.methodId, zone: { name: 'سایر استان‌ها' } },
    });
    await shipping.updateRate(rate.id, { freeAboveRial: 100_000_000 });

    await fillCart(500_000_000);
    const order = await orders.checkout(userId, {
      addressId: shiraz.id,
      shippingMethodId: sefareshi.methodId,
    });
    expect(Number(order.shippingToman)).toBe(0);
    expect(order.shippingMethod?.free).toBe(true);
    await orders.cancelByUser(userId, order.id);
    await shipping.updateRate(rate.id, { freeAboveRial: null });

    await config.set('shop.shipping.enabled', 'false');
    try {
      await fillCart(500_000_000);
      const legacy = await orders.checkout(userId, { addressId: shiraz.id });
      expect(legacy.shippingMethod).toBeNull();
      expect(Number(legacy.totalToman) * 10).toBe(500_000_000);
      await orders.cancelByUser(userId, legacy.id);
    } finally {
      await config.set('shop.shipping.enabled', 'true');
    }
  });
});
