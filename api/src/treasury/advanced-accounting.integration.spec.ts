// api/src/treasury/advanced-accounting.integration.spec.ts
//
// آزمون یکپارچه‌ی حسابداری پیشرفته روی PostgreSQL واقعی (پس از prisma migrate deploy):
//   خرید طلای کاربر ← گزارش پوشش ← درخواست خرید از بازار ← قطعی ← رسید خزانه ← پرداخت
//   ← فروش اقساطی شریک (آب‌شده و شمش) ← تسویه/استرداد ← سند افتتاحیه‌ی شمش ← کدگذاری
//   ← ارزیابی طلا ← تراز/سود و زیان/ترازنامه/مغایرت‌گیری ← شمارش خزانه ← بستن سال مالی
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest advanced-accounting
// بدون این متغیر آزمون رد (skip) می‌شود.
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { AccountingReportsService } from '../accounting/accounting-reports.service';
import { AccountingManageService } from '../accounting/accounting-manage.service';
import { PartyLedgerService } from '../accounting/party-ledger.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { TradingService } from '../market/trading.service';
import { SmsService } from '../integrations/services/sms.service';
import { PricingEngineService } from '../catalog/pricing-engine.service';
import { InvoiceService } from '../invoice/invoice.service';
import { PartnerOrdersService } from '../partners/partner-orders.service';
import { PartnersService } from '../partners/partners.service';
import { TreasuryService } from './treasury.service';
import { BullionInventoryService } from './bullion-inventory.service';

const url = process.env.INTEGRATION_DATABASE_URL;
const run = url ? describe : describe.skip;

const PRICE = 50_000_000; // ریال برای هر گرم ۷۵۰

run('حسابداری پیشرفته (یکپارچه با PostgreSQL)', () => {
  let prisma: PrismaService;
  let accounting: AccountingService;
  let reports: AccountingReportsService;
  let manage: AccountingManageService;
  let treasury: TreasuryService;
  let partnerOrders: PartnerOrdersService;
  let partners: PartnersService;
  let bullion: BullionInventoryService;
  let trading: TradingService;
  let config: SystemConfigService;
  const admin1 = randomUUID();
  const admin2 = randomUUID();
  let walletId: string;
  const phone = `09${String(Date.now()).slice(-9)}`;

  const bal = async (code: string) => {
    const a = await prisma.account.findUniqueOrThrow({ where: { code } });
    return {
      rial: new Decimal(a.balanceRial.toString()),
      grams: new Decimal(a.balanceGrams.toString()),
    };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    config = new SystemConfigService(prisma);
    await config.onModuleInit();
    accounting = new AccountingService(prisma);
    await accounting.onModuleInit();
    const sequence = new DocumentSequenceService(prisma);
    const party = new PartyLedgerService();
    reports = new AccountingReportsService(prisma, accounting);
    manage = new AccountingManageService(prisma, accounting, sequence, config);
    treasury = new TreasuryService(
      prisma,
      accounting,
      party,
      sequence,
      config,
      { send: () => Promise.resolve({ sent: true }) } as unknown as SmsService,
    );
    const pricing = {
      getGoldPricePerGram: () => Promise.resolve(new Decimal(PRICE)),
    } as unknown as PricingEngineService;
    const invoices = {
      issueForPartnerOrder: () => Promise.resolve({ id: randomUUID() }),
    } as unknown as InvoiceService;
    partnerOrders = new PartnerOrdersService(
      prisma,
      accounting,
      party,
      sequence,
      config,
      pricing,
      invoices,
    );
    partners = new PartnersService(prisma, party);
    bullion = new BullionInventoryService(prisma);
    trading = new TradingService(prisma, null, config, accounting);

    await prisma.marketPrice.upsert({
      where: { metal: 'GOLD' },
      create: { metal: 'GOLD', pricePerGramRial: PRICE },
      update: { pricePerGramRial: PRICE },
    });
    const user = await prisma.user.create({
      data: {
        phone,
        referralCode: `IT${Date.now()}`,
        identity: {
          create: {
            firstName: 'آزمون',
            lastName: 'یکپارچه',
            nationalCode: String(Date.now()).slice(-10),
            status: 'VERIFIED',
          },
        },
        wallet: { create: { cardNumber: `6${String(Date.now()).slice(-15)}` } },
      },
      include: { wallet: true },
    });
    walletId = user.wallet.id;
    await prisma.adminRole.upsert({
      where: { key: 'IT_ROLE' },
      create: { key: 'IT_ROLE', name: 'it' },
      update: {},
    });
    const role = await prisma.adminRole.findUniqueOrThrow({
      where: { key: 'IT_ROLE' },
    });
    await prisma.adminUser.create({
      data: {
        id: admin1,
        username: `it-${admin1.slice(0, 8)}`,
        passwordHash: 'x',
        fullName: 'حسابدار آزمون',
        roleId: role.id,
      },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('خرید طلای کاربر کسری پوشش می‌سازد، نه موجودی خزانه', async () => {
    const before = await bal('1020');
    await prisma.$transaction(async (tx) => {
      // واریز ۶۰۰ میلیون ریال به کیف پول
      await tx.wallet.update({
        where: { id: walletId },
        data: { rialBalance: { increment: 600_000_000 } },
      });
      await accounting.postJournal(tx, {
        description: 'واریز آزمون',
        totalRial: 600_000_000,
        totalGrams: 0,
        lines: [
          { accountCode: '1010', side: 'DEBIT', amountRial: 600_000_000 },
          { accountCode: '2010', side: 'CREDIT', amountRial: 600_000_000 },
        ],
      });
      // خرید ۱۰ گرم با کارمزد ۵ میلیون
      await tx.wallet.update({
        where: { id: walletId },
        data: {
          rialBalance: { decrement: 505_000_000 },
          goldBalanceGrams: { increment: 10 },
        },
      });
      await (
        trading as unknown as {
          postDoubleEntryAccounting: (t: unknown, p: unknown) => Promise<void>;
        }
      ).postDoubleEntryAccounting(tx, {
        side: 'BUY',
        orderId: randomUUID(),
        totalRial: new Decimal(500_000_000),
        amountGrams: new Decimal(10),
        feeRial: new Decimal(5_000_000),
        taxRial: new Decimal(0),
      });
    });
    expect((await bal('1020')).grams.equals(before.grams)).toBe(true);
    const report = await treasury.coverageReport();
    expect(Number(report.shortfallGrams)).toBeGreaterThanOrEqual(10);
    expect(Number(report.recommendedPurchaseGrams)).toBeGreaterThanOrEqual(10);
    expect(report.status).not.toBe('COVERED');
  });

  let supplierId: string;
  let orderId: string;

  it('درخواست خرید از گزارش ← قطعی ← رسید خزانه ← پرداخت', async () => {
    const sup = await treasury.createSupplier({ name: 'بنکدار آزمون' });
    supplierId = sup.id;
    const coverageBefore = await treasury.coverageReport();
    const req = await treasury.createPurchaseRequest(admin1, {
      supplierId,
      grams: '10',
    });
    orderId = req.id;
    const draft = await prisma.treasuryOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(draft.status).toBe('DRAFT');
    expect(draft.coverageSnapshot).toBeTruthy();

    const coverageBefore1090 = await bal('1090');
    await treasury.confirmOrder(admin1, orderId);
    expect(
      (await bal('1090')).grams.equals(coverageBefore1090.grams.minus(10)),
    ).toBe(true);
    expect((await bal('1060')).grams.toNumber()).toBeGreaterThanOrEqual(10);
    const after = await treasury.coverageReport();
    expect(Number(after.shortfallGrams)).toBeCloseTo(
      Math.max(0, Number(coverageBefore.shortfallGrams) - 10),
      3,
    );

    const vaultBefore = await bal('1020');
    await treasury.receiveOrder(admin1, orderId, {
      vaultLocation: 'گاوصندوق ۱',
    });
    const vault = await bal('1020');
    expect(vault.grams.minus(vaultBefore.grams).toNumber()).toBe(10);
    expect(vault.rial.minus(vaultBefore.rial).toNumber()).toBe(500_000_000);

    await treasury.recordPayment(admin1, {
      supplierId,
      orderId,
      direction: 'PAY',
      amountRial: '500000000',
      method: 'BANK_TRANSFER',
      referenceNumber: 'IT-1',
    });
    const sup2 = await prisma.supplier.findUniqueOrThrow({
      where: { id: supplierId },
    });
    expect(sup2.balanceRial.toString()).toBe('0');
    const o = await prisma.treasuryOrder.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(o.status).toBe('RECEIVED');
    expect(o.paidRial.toString()).toBe('500000000');
  });

  let partnerId: string;

  it('فروش اقساطی طلای آب‌شده از طریق شریک، تسویه و استرداد', async () => {
    const p = await partners.create(admin1, {
      name: 'اسنپ‌پی آزمون',
      kind: 'BNPL',
      providerKey: 'SNAPPPAY',
      commissionPercent: '3',
      settlementDays: 7,
      allowedProducts: ['MELTED_GOLD', 'BULLION'],
    });
    partnerId = p.id;
    const recvBefore = await bal('1050');
    const walletBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });

    const res = await partnerOrders.createFromAdmin(admin1, {
      partnerId,
      externalRef: `SP-${Date.now()}`,
      customerPhone: phone,
      productKind: 'MELTED_GOLD',
      amountGrams: '2',
      installmentCount: 4,
      confirmNow: true,
    });
    expect(res.order.status).toBe('CONFIRMED');
    const total = new Decimal(res.order.totalRial);
    const commission = new Decimal(res.order.commissionRial);
    expect(commission.toNumber()).toBe(total.times(0.03).round().toNumber());
    const walletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: walletId },
    });
    expect(
      new Decimal(walletAfter.goldBalanceGrams.toString())
        .minus(walletBefore.goldBalanceGrams.toString())
        .toNumber(),
    ).toBe(2);
    expect((await bal('1050')).rial.minus(recvBefore.rial).toString()).toBe(
      res.order.netReceivableRial,
    );

    // idempotency
    const again = await partnerOrders.create({
      partnerId,
      externalRef: res.order.externalRef,
      customerPhone: phone,
      productKind: 'MELTED_GOLD',
      amountGrams: '2',
      createdVia: 'API',
    });
    expect(again.alreadyExists).toBe(true);

    const st = await partnerOrders.settle(admin1, {
      partnerId,
      amountRial: res.order.netReceivableRial,
      method: 'BANK_TRANSFER',
      autoAllocate: true,
    });
    expect(st.settledOrders).toBe(1);
    expect((await bal('1050')).rial.equals(recvBefore.rial)).toBe(true);

    // سفارش دوم و استرداد آن
    const r2 = await partnerOrders.createFromAdmin(admin1, {
      partnerId,
      externalRef: `SP2-${Date.now()}`,
      customerPhone: phone,
      productKind: 'MELTED_GOLD',
      amountRial: '100000000',
      confirmNow: true,
    });
    const gold2020Before = await bal('2020');
    await partnerOrders.refund(r2.order.id, 'انصراف مشتری', admin1);
    const gold2020After = await bal('2020');
    expect(gold2020Before.grams.minus(gold2020After.grams).toString()).toBe(
      r2.order.amountGrams,
    );
    const partner = await prisma.salesPartner.findUniqueOrThrow({
      where: { id: partnerId },
    });
    expect(partner.balanceRial.toString()).toBe('0');
  });

  it('سند افتتاحیه‌ی شمش (کنترل دوگانه)، کدگذاری و فروش شمش از طریق شریک', async () => {
    const v = await manage.createVoucher(admin1, {
      type: 'OPENING',
      entryDate: new Date().toISOString(),
      description: 'موجودی افتتاحیه‌ی شمش',
      lines: [
        {
          accountCode: '1025',
          side: 'DEBIT',
          amountRial: '4000000000',
          amountGrams: '100',
        },
        { accountCode: '3010', side: 'CREDIT', amountRial: '4000000000' },
        { accountCode: '1095', side: 'CREDIT', amountGrams: '100' },
      ],
    });
    await expect(manage.approveVoucher(admin1, v.id)).rejects.toThrow();
    await manage.approveVoucher(admin2, v.id);

    const batch = await prisma.hologramBatch.create({
      data: {
        batchNumber: `IT-${Date.now()}`,
        quantity: 2,
        createdByAdminId: admin1,
      },
    });
    const c1 = String(Date.now()).slice(-8);
    const c2 = String(Date.now() + 1).slice(-8);
    await prisma.hologramCode.createMany({
      data: [
        { code: c1, batchId: batch.id },
        { code: c2, batchId: batch.id },
      ],
    });
    await bullion.codeBars({
      items: [{ code: c1, weightGrams: '10', purityKarat: 'K24' }],
    });
    const summary = await bullion.summary({});
    expect(summary.totals.vaultCoded.count).toBeGreaterThanOrEqual(1);
    expect(summary.codes.blank).toBeGreaterThanOrEqual(1);

    const cogsBefore = await bal('5060');
    const r = await partnerOrders.createFromAdmin(admin1, {
      partnerId,
      externalRef: `BAR-${Date.now()}`,
      customerPhone: phone,
      productKind: 'BULLION',
      hologramCode: c1,
      wageRial: '20000000',
      confirmNow: true,
    });
    expect(r.order.status).toBe('CONFIRMED');
    const cogs = await bal('5060');
    // بهای میانگین: ۴۰ میلیون ریال برای هر گرم
    expect(cogs.rial.minus(cogsBefore.rial).toNumber()).toBe(400_000_000);
    const code = await prisma.hologramCode.findUniqueOrThrow({
      where: { code: c1 },
    });
    expect(code.status).toBe('ASSIGNED');
    const sold = await bullion.items({ bucket: 'SOLD', search: c1 });
    expect((sold.data[0] as { soldChannel?: string }).soldChannel).toBe(
      'PARTNER',
    );
  });

  it('ارزیابی طلا، گزارش‌های مالی و مغایرت‌گیری', async () => {
    await prisma.marketPrice.update({
      where: { metal: 'GOLD' },
      data: { pricePerGramRial: 55_000_000 },
    });
    const preview = await reports.revaluationPreview();
    expect(preview.hasAdjustment).toBe(true);
    await reports.postRevaluation(admin1);
    const vault = await bal('1020');
    expect(vault.rial.equals(vault.grams.times(55_000_000))).toBe(true);

    const tb = await reports.trialBalance({});
    expect(tb.isBalanced).toBe(true);
    const bs = await reports.balanceSheet();
    expect(bs.isBalanced).toBe(true);
    const pl = await reports.incomeStatement({});
    expect(pl.sections).toBeDefined();
    const rec = await reports.reconciliation();
    expect(rec.integrityIssues).toHaveLength(0);
    const byKey = Object.fromEntries(rec.checks.map((c) => [c.key, c]));
    expect(byKey.SUPPLIER_PAYABLE.ok).toBe(true);
    expect(byKey.PARTNER_RECEIVABLE.ok).toBe(true);
    expect(byKey.IN_TRANSIT.ok).toBe(true);

    const acc = await prisma.account.findUniqueOrThrow({
      where: { code: '1020' },
    });
    const st = await reports.accountStatement(acc.id, {});
    expect(st?.data.length).toBeGreaterThan(0);
    const last = st.data[st.data.length - 1];
    expect(last.balanceRial).toBe(acc.balanceRial.toString());
  });

  it('شمارش خزانه: کسری به هزینه و کسری پوشش منتقل می‌شود', async () => {
    const vault = await bal('1020');
    const coverage = await bal('1090');
    const r = await treasury.recordVaultCount(admin1, {
      assetType: 'MELTED_GOLD',
      countedGrams: vault.grams.minus(1).toString(),
    });
    expect(r.differenceGrams).toBe('-1');
    expect((await bal('1090')).grams.equals(coverage.grams.plus(1))).toBe(true);
    expect((await bal('1020')).grams.equals(vault.grams.minus(1))).toBe(true);
  });

  it('همه‌ی گزارش‌ها و فهرست‌ها بدون خطا اجرا می‌شوند', async () => {
    const dash = await reports.dashboard();
    expect(dash.goldPosition.meltedGold.length).toBe(4);
    const pos = await reports.goldPosition();
    expect(pos.pricePerGramRial).toBe('55000000');
    const range = {
      from: '2020-01-01',
      to: new Date().toISOString().slice(0, 10),
    };
    expect(
      (await reports.trialBalance({ ...range, hideZero: true })).isBalanced,
    ).toBe(true);
    await reports.incomeStatement(range);
    await reports.balanceSheet(range.to);
    await manage.listAccounts();
    await manage.listVouchers({});
    await manage.listFiscalYears();
    const cov = await treasury.coverageReport(range);
    expect(cov.flows.data.length).toBeGreaterThan(0);
    await treasury.listOrders({});
    await treasury.getOrder(orderId);
    await treasury.listSuppliers({});
    const stmt = await treasury.supplierStatement(supplierId, {});
    expect(stmt.data.length).toBeGreaterThan(0);
    await treasury.listPayments({});
    await treasury.listVaultCounts({});
    for (const bucket of [
      'BLANK',
      'VAULT_CODED',
      'AT_AGENT',
      'SOLD',
      'TRANSFER_PENDING',
      'REVOKED',
      'AWAITING_CODE',
    ]) {
      await bullion.items({ bucket });
    }
    const inv = await bullion.summary(range);
    expect(inv.sales.partners.count).toBeGreaterThanOrEqual(1);
    await partners.list({});
    const rep = await partners.report(range);
    expect(rep.data.length).toBeGreaterThan(0);
    await partners.statement(partnerId, {});
    await partnerOrders.list({ overdue: 'true' });
    await partnerOrders.listSettlements({});
    const journals = await new (
      await import('../accounting/accounting-admin.service')
    ).AccountingAdminService(prisma).listJournalEntries({
      withLines: true,
      source: 'TREASURY',
    });
    expect(journals.data.length).toBeGreaterThan(0);
  });

  it('سال مالی: قطعی‌سازی و بستن حساب‌های موقت', async () => {
    const start = new Date('2020-03-20T00:00:00Z');
    // پایان سال باید بعد از آخرین سند و پیش از اکنون باشد
    await new Promise((r) => setTimeout(r, 1200));
    const end = new Date(Date.now() - 500);
    const y = await manage.createFiscalYear({
      title: 'سال آزمون',
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
    const res = await manage.closeFiscalYear(admin1, y.id);
    expect(res.closingJournalId).toBeTruthy();
    const incomes = await prisma.account.findMany({
      where: { type: { in: ['INCOME', 'EXPENSE'] } },
    });
    for (const a of incomes) expect(a.balanceRial.toString()).toBe('0');
    const bs = await reports.balanceSheet();
    expect(bs.isBalanced).toBe(true);
    expect(bs.currentEarningsRial).toBe('0');
    const tb = await reports.trialBalance({});
    expect(tb.isBalanced).toBe(true);
    // قفل دوره تا پایان سال بسته‌شده
    await expect(
      manage.createVoucher(admin1, {
        entryDate: new Date(end.getTime() - 86400_000).toISOString(),
        description: 'سند در دوره‌ی قفل',
        lines: [
          { accountCode: '5100', side: 'DEBIT', amountRial: '1000' },
          { accountCode: '1010', side: 'CREDIT', amountRial: '1000' },
        ],
      }),
    ).rejects.toThrow();
  });
});
