// api/src/agent/agent-trading.integration.spec.ts
//
// آزمون یکپارچه‌ی خرید و فروش قطعی نمایندگان روی PostgreSQL و Redis واقعی (پس از
// prisma migrate deploy):
//   حساب بانکی ← واریز بانکی و تأیید ← سفارش خرید از کیف پول ← تأیید و تخصیص شمش + صورتحساب
//   به نام نماینده + حواله ← تحویل و تأیید رسید ← ثبت فروش شمش ملکی به مشتری (فقط ثبت اصالت،
//   بدون فاکتور شرکت) ← فروش شمش به شرکت ← برداشت ← تطبیق کیف پول با حساب 2070
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... INTEGRATION_REDIS_URL=redis://... npx jest agent-trading
// بدون این متغیرها آزمون رد (skip) می‌شود.
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import Redis from 'ioredis';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import { InvoiceService } from '../invoice/invoice.service';
import { BrandingService } from '../branding/branding.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentityVerificationService } from '../integrations/services/identity-verification.service';
import { PaymentGatewayFactory } from '../payment-gateway/payment-gateway.factory';
import { AgentAccountingService } from './agent-accounting.service';
import { AgentWalletService } from './agent-wallet.service';
import { AgentOrderPaymentService } from './agent-order-payment.service';
import { AgentFundsService } from './agent-funds.service';
import { AgentPurchaseService } from './agent-purchase.service';
import { AgentBuybackService } from './agent-buyback.service';
import { AgentSaleService } from './agent-sale.service';

const url = process.env.INTEGRATION_DATABASE_URL;
const redisUrl = process.env.INTEGRATION_REDIS_URL;
const run = url && redisUrl ? describe : describe.skip;

const PRICE_K24 = 80_000_000; // ریال برای هر گرم ۲۴ عیار
const PREMIUM = 20_000_000; // اجرت هر شمش ۱۰ گرمی

run('خرید و فروش قطعی نمایندگان (یکپارچه با PostgreSQL و Redis)', () => {
  let prisma: PrismaService;
  let redis: Redis;
  let config: SystemConfigService;
  let wallet: AgentWalletService;
  let funds: AgentFundsService;
  let purchases: AgentPurchaseService;
  let buybacks: AgentBuybackService;
  let sales: AgentSaleService;
  const suffix = randomUUID().slice(0, 8);
  const seed = String(Date.now());
  let adminId: string;
  let agentId: string;
  let priceItemId: string;
  let bankAccountId: string;
  let orderId: string;
  const codes = [`9${seed.slice(-7)}`, `8${seed.slice(-7)}`];

  const bal = async (code: string) => {
    const a = await prisma.account.findUniqueOrThrow({ where: { code } });
    return {
      rial: new Decimal(a.balanceRial.toString()),
      grams: new Decimal(a.balanceGrams.toString()),
    };
  };
  const walletBalance = async () =>
    new Decimal((await wallet.summary(agentId)).balanceRial);

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    redis = new Redis(redisUrl);
    config = new SystemConfigService(prisma);
    await config.onModuleInit();
    for (const [k, v] of [
      ['company.legal_name', 'شرکت آزمون آرکان'],
      ['company.national_id', '10100000000'],
      ['company.registration_number', '12345'],
      ['company.address', 'تهران، خیابان آزمون'],
      ['agent.sale.require_identity_verification', 'false'],
      ['agent.sale.notify_buyer_sms', 'false'],
      ['agent.consumer.max_markup_percent', '3'],
      ['deposit.bank_transfer.destination_sheba', 'IR820540102680020817909002'],
    ]) {
      await config.set(k, v);
    }
    const accounting = new AccountingService(prisma);
    await accounting.onModuleInit();
    const sequence = new DocumentSequenceService(prisma);
    const agentAccounting = new AgentAccountingService(accounting);
    const sms = {
      send: () => Promise.resolve({ status: 'SENT' }),
    } as unknown as SmsTemplateService;
    const pricing = {
      getGoldPricePerGram: (p: string) =>
        Promise.resolve(new Decimal(p === 'K24' ? PRICE_K24 : 60_000_000)),
    } as unknown as PricingEngineService;
    const invoices = new InvoiceService(
      prisma,
      config,
      sequence,
      {} as unknown as BrandingService,
    );
    const gateways = {} as unknown as PaymentGatewayFactory;
    wallet = new AgentWalletService(prisma);
    const orderPayment = new AgentOrderPaymentService(wallet, agentAccounting);
    funds = new AgentFundsService(
      prisma,
      sequence,
      config,
      sms,
      gateways,
      agentAccounting,
      wallet,
      orderPayment,
    );
    purchases = new AgentPurchaseService(
      prisma,
      sequence,
      config,
      sms,
      pricing,
      invoices,
      agentAccounting,
      wallet,
      orderPayment,
      funds,
    );
    buybacks = new AgentBuybackService(
      prisma,
      sequence,
      config,
      sms,
      pricing,
      agentAccounting,
      wallet,
      funds,
    );
    sales = new AgentSaleService(
      prisma,
      sequence,
      config,
      pricing,
      invoices,
      {
        notifyUserSms: () => Promise.resolve(),
      } as unknown as NotificationsService,
      {} as unknown as IdentityVerificationService,
      agentAccounting,
      purchases,
      accounting,
      redis,
    );

    // ── داده‌های پایه ──
    const admin = await prisma.adminUser.create({
      data: {
        username: `trading-admin-${suffix}`,
        passwordHash: 'x',
        fullName: 'کارشناس آزمون',
      },
    });
    adminId = admin.id;
    const agent = await prisma.agent.create({
      data: {
        code: `AGT-T-${suffix}`,
        name: 'نمایندگی آزمون خرید',
        managerName: 'مدیر آزمون',
        nationalCode: '0012345678',
        phone: `0912${seed.slice(-7)}`,
        legalType: 'INDIVIDUAL',
        economicCode: '411111111111',
      },
    });
    agentId = agent.id;
    await prisma.agentContract.create({
      data: {
        contractNumber: `CTR-IT-${suffix}`,
        agentId,
        title: 'قرارداد آزمون',
        body: 'متن',
        status: 'SIGNED',
        signedAt: new Date(),
        companySignedAt: new Date(),
      },
    });
    const item = await prisma.agentPriceItem.create({
      data: {
        title: `شمش ۱۰ گرمی آزمون ${suffix}`,
        weightGrams: 10,
        purityKarat: 'K24',
        premiumRial: PREMIUM,
        consumerPremiumRial: 40_000_000,
      },
    });
    priceItemId = item.id;
    const batch = await prisma.hologramBatch.create({
      data: {
        batchNumber: `B-IT-${suffix}`,
        quantity: 2,
        createdByAdminId: adminId,
      },
    });
    for (const code of codes) {
      await prisma.hologramCode.create({
        data: {
          code,
          batchId: batch.id,
          status: 'UNASSIGNED',
          weightGrams: 10,
          purityKarat: 'K24',
          vaultCodedAt: new Date(),
        },
      });
    }
    // موجودی افتتاحیه‌ی شمش خزانه تا بهای تمام‌شده محاسبه شود
    await prisma.$transaction((tx) =>
      accounting.postJournal(tx, {
        description: `افتتاحیه شمش آزمون ${suffix}`,
        totalRial: 1_500_000_000,
        totalGrams: 20,
        lines: [
          {
            accountCode: '1025',
            side: 'DEBIT',
            amountRial: 1_500_000_000,
            amountGrams: 20,
          },
          { accountCode: '3010', side: 'CREDIT', amountRial: 1_500_000_000 },
          { accountCode: '1095', side: 'CREDIT', amountGrams: 20 },
        ],
      }),
    );
  });

  afterAll(async () => {
    await redis?.quit();
    await prisma?.$disconnect();
  });

  it('حساب بانکی فقط پس از تأیید قابل استفاده است', async () => {
    const res = await funds.addBankAccount(
      agentId,
      {
        bankName: 'ملی',
        sheba: 'IR820540102680020817909002',
        ownerName: 'مدیر آزمون',
      },
      adminId,
    );
    bankAccountId = res.account.id;
    await expect(
      funds.createDeposit(agentId, adminId, {
        amountRial: 2_000_000_000,
        method: 'BANK_TRANSFER',
        transferType: 'SATNA',
        sourceBankAccountId: bankAccountId,
        bankReference: `SAT-${suffix}`,
      }),
    ).rejects.toThrow('تأیید نشده');
    await funds.reviewBankAccount(bankAccountId, true, undefined, adminId);
  });

  it('واریز بانکی پس از تأیید مالی به کیف پول جدا اضافه می‌شود', async () => {
    const before = await bal('2070');
    const res = await funds.createDeposit(agentId, adminId, {
      amountRial: 2_000_000_000,
      method: 'BANK_TRANSFER',
      transferType: 'SATNA',
      sourceBankAccountId: bankAccountId,
      bankReference: `SAT-${suffix}`,
    });
    if (!('deposit' in res) || !('status' in res.deposit)) {
      throw new Error('deposit expected');
    }
    expect(res.deposit.status).toBe('PENDING_REVIEW');
    expect((await walletBalance()).isZero()).toBe(true);
    // مرجع بانکی تکراری پذیرفته نمی‌شود
    await expect(
      funds.createDeposit(agentId, adminId, {
        amountRial: 1_000_000,
        method: 'BANK_TRANSFER',
        transferType: 'SATNA',
        sourceBankAccountId: bankAccountId,
        bankReference: `SAT-${suffix}`,
      }),
    ).rejects.toThrow('قبلاً ثبت شده');
    await funds.approveDeposit(res.deposit.id, adminId);
    expect((await walletBalance()).toString()).toBe('2000000000');
    expect((await bal('2070')).rial.minus(before.rial).toString()).toBe(
      '2000000000',
    );
  });

  it('سفارش خرید از کیف پول، تأیید با تخصیص شمش و صورتحساب به نام نماینده', async () => {
    const created = await purchases.createOrder(agentId, adminId, {
      items: [{ priceItemId, quantity: 2 }],
      paymentMethod: 'WALLET',
      deliveryMethod: 'IN_PERSON',
    });
    orderId = created.order.id;
    // ۲ × (۱۰ × ۸۰٬۰۰۰٬۰۰۰ + ۲۰٬۰۰۰٬۰۰۰) = ۱٬۶۴۰٬۰۰۰٬۰۰۰ ریال
    expect(created.order.totalRial.toString()).toBe('1640000000');
    expect(created.order.status).toBe('PAID');
    expect((await walletBalance()).toString()).toBe('360000000');

    const before4040 = await bal('4040');
    await expect(
      purchases.approve(orderId, adminId, { codes: [codes[0]] }),
    ).rejects.toThrow('برابر نیست');
    const approved = await purchases.approve(orderId, adminId, { codes });
    expect(approved.order.status).toBe('APPROVED');
    expect(approved.order.invoiceId).toBeTruthy();
    expect(approved.order.bars).toHaveLength(2);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: approved.order.invoiceId as string },
      include: { items: true },
    });
    expect(invoice.agentId).toBe(agentId);
    expect(invoice.userId).toBeNull();
    expect(invoice.sourceType).toBe('AGENT_PURCHASE');
    expect(invoice.totalRial.toString()).toBe('1640000000');
    expect(invoice.items[0].title).toContain('کدهای هولوگرام');

    const bars = await prisma.hologramCode.findMany({
      where: { code: { in: codes } },
    });
    expect(bars.every((b) => b.status === 'AGENT_OWNED')).toBe(true);
    expect(bars.every((b) => b.agentId === agentId)).toBe(true);
    expect((await bal('4040')).rial.minus(before4040.rial).toString()).toBe(
      '1600000000',
    );
  });

  it('شمش ملکی پیش از تحویل قابل فروش نیست؛ پس از تحویل فقط اصالت ثبت می‌شود', async () => {
    await expect(sales.quote(agentId, codes[0])).rejects.toThrow(
      'هنوز به شما تحویل نشده',
    );
    await purchases.markDelivered(orderId, adminId);
    await purchases.confirmReceipt(orderId, { adminUserId: adminId, agentId });
    const order = await prisma.agentPurchaseOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(order.status).toBe('DELIVERED');

    const quote = await sales.quote(agentId, codes[0]);
    expect(quote.stockSource).toBe('OWNED');
    expect(quote.netPayableRial).toBe('0');
    // سقف مصرف‌کننده: ۱۰ × ۸۰٬۰۰۰٬۰۰۰ × ۱٫۰۳ + ۴۰٬۰۰۰٬۰۰۰
    expect(quote.consumerMaxPriceRial).toBe('864000000');

    const journalsBefore = await prisma.journalEntry.count();
    const invoicesBefore = await prisma.invoice.count();
    const buyerPhone = `0935${seed.slice(-7)}`;
    const base = {
      hologramCode: codes[0],
      quoteId: quote.quoteId,
      buyerPhone,
      buyerFirstName: 'خریدار',
      buyerLastName: 'آزمون',
      buyerNationalCode: seed.slice(-10),
      buyerBirthDate: '1990-01-01',
      paymentMethod: 'POS' as const,
      buyerConsent: true,
    };
    await expect(
      sales.createSale(
        { adminUserId: adminId, agentId },
        { ...base, salePriceRial: 900_000_000 },
      ),
    ).rejects.toThrow('سقف قیمت مصرف‌کننده');
    const sale = await sales.createSale(
      { adminUserId: adminId, agentId },
      { ...base, salePriceRial: 850_000_000, agentInvoiceNumber: 'AG-INV-1' },
    );
    expect(sale.stockSource).toBe('OWNED');
    expect(sale.invoiceId).toBeNull();
    // هیچ سند حسابداری و هیچ فاکتوری از طرف شرکت برای مشتری صادر نشد
    expect(await prisma.journalEntry.count()).toBe(journalsBefore);
    expect(await prisma.invoice.count()).toBe(invoicesBefore);
    const ownership = await prisma.hologramOwnership.findFirstOrThrow({
      where: { hologramCode: { code: codes[0] }, status: 'ACTIVE' },
    });
    expect(ownership.fullName).toBe('خریدار آزمون');
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { id: agentId },
    });
    expect(new Decimal(agent.balanceRial.toString()).isZero()).toBe(true);
  });

  it('فروش شمش ملکی به شرکت: قفل قیمت، بازرسی، صورتحساب نماینده و واریز به کیف پول', async () => {
    const before1025 = await bal('1025');
    const created = await buybacks.create(agentId, adminId, {
      codes: [codes[1]],
      payoutMethod: 'WALLET',
    });
    const id = created.order.id;
    // ۱۰ × ۸۰٬۰۰۰٬۰۰۰ × (۱ − ۱٪) = ۷۹۲٬۰۰۰٬۰۰۰
    expect(created.order.quotedTotalRial.toString()).toBe('792000000');
    const bar = await prisma.hologramCode.findUniqueOrThrow({
      where: { code: codes[1] },
    });
    expect(bar.status).toBe('BUYBACK_PENDING');
    await expect(sales.quote(agentId, codes[1])).rejects.toThrow();

    await buybacks.receive(id, adminId, {
      items: [{ code: codes[1], accepted: true, finalRial: 790_000_000 }],
    });
    await expect(buybacks.approve(id, adminId)).rejects.toThrow('صورتحساب');
    await buybacks.setAgentInvoice(agentId, id, {
      agentInvoiceNumber: 'A-123456',
      agentInvoiceDate: new Date().toISOString(),
    });
    await buybacks.approve(id, adminId);
    await buybacks.pay(id, adminId);

    expect((await walletBalance()).toString()).toBe('1150000000');
    const after = await prisma.hologramCode.findUniqueOrThrow({
      where: { code: codes[1] },
    });
    expect(after.status).toBe('UNASSIGNED');
    expect(after.agentId).toBeNull();
    const now1025 = await bal('1025');
    expect(now1025.grams.minus(before1025.grams).toNumber()).toBe(10);
  });

  it('برداشت فقط به حساب تأییدشده؛ رزرو تا پرداخت و تطبیق کیف پول با حساب 2070', async () => {
    const req = await funds.createWithdrawal(agentId, adminId, {
      amountRial: 1_000_000_000,
      bankAccountId,
    });
    const s1 = await wallet.summary(agentId);
    expect(s1.blockedRial).toBe('1000000000');
    expect(s1.availableRial).toBe('150000000');
    await expect(
      funds.createWithdrawal(agentId, adminId, {
        amountRial: 200_000_000,
        bankAccountId,
      }),
    ).rejects.toThrow('کافی نیست');

    await funds.approveWithdrawal(req.request.id, adminId);
    await funds.payWithdrawal(req.request.id, `PAY-${suffix}`, adminId);
    const s2 = await wallet.summary(agentId);
    expect(s2.balanceRial).toBe('150000000');
    expect(s2.blockedRial).toBe('0');

    const totals = await wallet.totals();
    expect((await bal('2070')).rial.toFixed(0)).toBe(totals.balanceRial);
    expect((await bal('2080')).rial.isZero()).toBe(true);
  });
});
