// api/src/accounting/single-bank-gold-taxbooks.integration.spec.ts
//
// آزمون یکپارچه‌ی «صفر تا صد» راه‌اندازی مالی روی PostgreSQL واقعی (دیتابیس جداگانه‌ی موقت):
//   سال مالی ← سند افتتاحیه روی 1010 ← تعریف تنها حساب بانک ملت (101001) و انتقال مانده
//   ← هدایت اسناد سیستمی 1010 به بانک ملت ← سند هزینه ← طلای نزد بانک کارگشایی، وام و کارمزد
//   ← دفاتر تجاری الکترونیکی: قطعی‌سازی، فایل سندبه‌سند و ماهانه، پیوستگی بازه، قفل و فایل اصلاحی
//
// اجرا:  INTEGRATION_DATABASE_URL=postgresql://... npx jest single-bank-gold-taxbooks
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';
import * as JSZip from 'jszip';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from './accounting.service';
import { AccountingManageService } from './accounting-manage.service';
import { AccountingReportsService } from './accounting-reports.service';
import { GoldCustodyService } from './gold-custody.service';
import { TaxBooksService } from './tax-books/tax-books.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SystemConfigService } from '../system-config/system-config.service';

const baseUrl = process.env.INTEGRATION_DATABASE_URL;
const run = baseUrl ? describe : describe.skip;

/** اجرای دستور مدیریتی (ساخت/حذف دیتابیس موقت) روی دیتابیس پایه */
async function adminExec(sql: string) {
  const admin = new PrismaClient({
    adapter: new PrismaPg({ connectionString: baseUrl }),
  });
  try {
    await admin.$executeRawUnsafe(sql);
  } finally {
    await admin.$disconnect();
  }
}

run('یک حساب بانک ملت، طلای کارگشایی و دفاتر تجاری (یکپارچه)', () => {
  const dbName = `arkan_taxbooks_${Date.now()}`;
  let url: string;
  let prisma: PrismaService;
  let accounting: AccountingService;
  let manage: AccountingManageService;
  let reports: AccountingReportsService;
  let custody: GoldCustodyService;
  let taxBooks: TaxBooksService;
  let config: SystemConfigService;
  let fiscalYearId: string;
  const maker = randomUUID();
  const checker = randomUUID();

  const bal = async (code: string) => {
    const a = await prisma.account.findUniqueOrThrow({ where: { code } });
    return { rial: a.balanceRial.toString(), grams: a.balanceGrams.toString() };
  };
  const voucher = async (
    entryDate: string,
    description: string,
    lines: {
      accountCode: string;
      side: 'DEBIT' | 'CREDIT';
      amountRial?: string;
      amountGrams?: string;
    }[],
    type?: 'OPENING' | 'GENERAL',
  ) => {
    const v = await manage.createVoucher(maker, {
      entryDate,
      description,
      lines,
      type,
    });
    return manage.approveVoucher(checker, v.id);
  };

  beforeAll(async () => {
    await adminExec(`CREATE DATABASE "${dbName}"`);
    const u = new URL(baseUrl);
    u.pathname = `/${dbName}`;
    url = u.toString();
    execSync('npx prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'ignore',
    });
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    }) as unknown as PrismaService;
    config = new SystemConfigService(prisma);
    await config.onModuleInit();
    accounting = new AccountingService(prisma);
    await accounting.onModuleInit();
    manage = new AccountingManageService(
      prisma,
      accounting,
      new DocumentSequenceService(prisma),
      config,
    );
    reports = new AccountingReportsService(prisma, accounting);
    custody = new GoldCustodyService(prisma, accounting);
    taxBooks = new TaxBooksService(prisma, config);
    await prisma.marketPrice.upsert({
      where: { metal: 'GOLD' },
      create: { metal: 'GOLD', pricePerGramRial: 80_000_000 },
      update: { pricePerGramRial: 80_000_000 },
    });
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (baseUrl) {
      await adminExec(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    }
  });

  it('سال مالی ۱۴۰۴ و سند افتتاحیه', async () => {
    const y = await manage.createFiscalYear({
      title: 'سال مالی ۱۴۰۴',
      startDate: '2025-03-21',
      endDate: '2026-03-20',
    });
    fiscalYearId = y.id;
    // بدون حساب معین، 1010 خودش حساب بانکی است
    expect(await accounting.resolveBankAccount(prisma)).toBe('1010');
    await voucher(
      '2025-03-21',
      'سند افتتاحیه: سرمایه‌ی نقدی و طلای خزانه',
      [
        { accountCode: '1010', side: 'DEBIT', amountRial: '10000000000' },
        {
          accountCode: '1020',
          side: 'DEBIT',
          amountRial: '7000000000',
          amountGrams: '100',
        },
        { accountCode: '1090', side: 'CREDIT', amountGrams: '100' },
        { accountCode: '3010', side: 'CREDIT', amountRial: '17000000000' },
      ],
      'OPENING',
    );
    expect(await bal('1010')).toEqual({ rial: '10000000000', grams: '0' });
  });

  it('تنها حساب بانک ملت: تعریف، انتقال مانده‌ی 1010 و هدایت اسناد سیستمی', async () => {
    await manage.createAccount({
      code: '101001',
      name: 'بانک ملت — جاری تجاری',
      type: 'ASSET',
      parentCode: '1010',
    });
    // تنها معین زیر 1010 خودکار انتخاب می‌شود حتی بدون تنظیم
    expect(await accounting.resolveBankAccount(prisma)).toBe('101001');
    await manage.setDefaultBankAccount('101001');
    await expect(manage.setDefaultBankAccount('1010')).rejects.toThrow(
      /زیرحساب دارد/,
    );
    await expect(
      accounting.resolveBankAccount(prisma, { explicit: '1010' }),
    ).rejects.toThrow(/زیرحساب دارد/);

    // انتقال مانده‌ی قبلی 1010 (مجاز چون 1010 هنوز مانده‌ی مستقیم دارد)
    await voucher('2025-03-22', 'انتقال مانده به حساب بانک ملت', [
      { accountCode: '101001', side: 'DEBIT', amountRial: '10000000000' },
      { accountCode: '1010', side: 'CREDIT', amountRial: '10000000000' },
    ]);
    expect(await bal('1010')).toEqual({ rial: '0', grams: '0' });
    // از این به بعد ثبت سند دستی روی 1010 مجاز نیست
    await expect(
      manage.createVoucher(maker, {
        entryDate: '2025-03-23',
        description: 'اشتباه',
        lines: [
          { accountCode: '5100', side: 'DEBIT', amountRial: '1' },
          { accountCode: '1010', side: 'CREDIT', amountRial: '1' },
        ],
      }),
    ).rejects.toThrow(/زیرحساب دارد/);

    // سند خودکار (مثلاً پرداخت درگاه) روی 1010 → بانک ملت
    const j = await prisma.$transaction((tx) =>
      accounting.postJournal(tx, {
        description: 'فروش فروشگاه — پرداخت درگاه',
        totalRial: 5_000_000,
        totalGrams: 0,
        lines: [
          { accountCode: '1010', side: 'DEBIT', amountRial: 5_000_000 },
          { accountCode: '4020', side: 'CREDIT', amountRial: 5_000_000 },
        ],
      }),
    );
    const lines = await prisma.ledgerEntry.findMany({
      where: { journalEntryId: j.id },
      include: { account: true },
    });
    expect(lines.map((l) => l.account.code).sort()).toEqual(['101001', '4020']);
    // برگشت همان سند دقیقاً روی همان حساب
    await prisma.$transaction((tx) =>
      accounting.reverseJournal(tx, j.id, { createdByAdminId: checker }),
    );
    expect(await bal('101001')).toEqual({ rial: '10000000000', grams: '0' });
    const dash = await reports.dashboard();
    expect(dash.cash.rial).toBe('10000000000');
  });

  it('ثبت هزینه با سند دستی (کنترل دوگانه)', async () => {
    await voucher('2025-04-15', 'اجاره‌ی فروردین دفتر', [
      { accountCode: '5100', side: 'DEBIT', amountRial: '300000000' },
      { accountCode: '101001', side: 'CREDIT', amountRial: '300000000' },
    ]);
    await voucher('2025-04-28', 'هزینه‌ی سرور و اینترنت', [
      { accountCode: '5180', side: 'DEBIT', amountRial: '20000000' },
      { accountCode: '5130', side: 'DEBIT', amountRial: '150000' },
      { accountCode: '101001', side: 'CREDIT', amountRial: '20150000' },
    ]);
    expect((await bal('101001')).rial).toBe('9679850000');
  });

  it('طلای نزد بانک کارگشایی: سپردن به بهای میانگین، وام، کارمزد و بازگشت', async () => {
    const res = await custody.transfer(maker, {
      direction: 'TO_BANK',
      grams: '40',
      date: '2025-05-01',
      reference: 'KG-1404-77',
    });
    expect(res.costRial).toBe('2800000000'); // ۴۰ × ۷۰٬۰۰۰٬۰۰۰
    expect(await bal('1020')).toEqual({ rial: '4200000000', grams: '60' });
    expect(await bal('1027')).toEqual({ rial: '2800000000', grams: '40' });

    await voucher('2025-05-01', 'دریافت وام کارگشایی در برابر وثیقه‌ی طلا', [
      { accountCode: '101001', side: 'DEBIT', amountRial: '2000000000' },
      { accountCode: '2090', side: 'CREDIT', amountRial: '2000000000' },
    ]);
    await voucher('2025-05-10', 'کارمزد و کارشناسی وام کارگشایی', [
      { accountCode: '5190', side: 'DEBIT', amountRial: '40000000' },
      { accountCode: '101001', side: 'CREDIT', amountRial: '40000000' },
    ]);
    await expect(
      custody.transfer(maker, { direction: 'FROM_BANK', grams: '41' }),
    ).rejects.toThrow(/کمتر از/);
    await custody.transfer(maker, {
      direction: 'FROM_BANK',
      grams: '10',
      date: '2025-05-20',
    });
    expect(await bal('1027')).toEqual({ rial: '2100000000', grams: '30' });

    const pos = await reports.goldPosition();
    expect(pos.goldAtBankGrams).toBe('30');
    expect(pos.meltedGold.map((r) => r.code)).toContain('1027');
    const s = await custody.summary();
    expect(s.loanBalanceRial).toBe('2000000000');
    expect(s.history).toHaveLength(2);
  });

  it('دفاتر تجاری: سندبه‌سند نیازمند قطعی‌سازی، CSV، پیوستگی بازه و قفل', async () => {
    const ov = await taxBooks.overview(fiscalYearId);
    expect(ov.next?.start).toBe('2025-03-21');

    const pre = await taxBooks.preview({
      fiscalYearId,
      endDate: '2025-04-20', // پایان فروردین ۱۴۰۴
      mode: 'DOCUMENT',
    });
    expect(pre.hasErrors).toBe(true); // اسناد قطعی نشده‌اند
    await manage.finalizeJournals('2025-04-20');

    const ok = await taxBooks.preview({
      fiscalYearId,
      endDate: '2025-04-20',
      mode: 'DOCUMENT',
    });
    expect(ok.hasErrors).toBe(false);
    expect(ok.balanced).toBe(true);
    expect(ok.period).toMatchObject({
      startJalali: '1404/01/01',
      endJalali: '1404/01/31',
    });
    // افتتاحیه، انتقال مانده، اجاره (سند ۲۰۲۵-۰۴-۲۸ = ۸ اردیبهشت، در فایل بعدی)
    expect(ok.journalCount).toBe(3);
    expect(
      ok.sample.every((r) => r.date >= '1404/01/01' && r.date <= '1404/01/31'),
    ).toBe(true);
    const goldLine = ok.sample.find((r) => r.kolCode === '1020');
    expect(goldLine?.debitRial).toBe('7000000000');
    const bankLine = ok.sample.find((r) => r.moeinCode === '101001');
    expect(bankLine).toMatchObject({ kolCode: '1010' });

    const exp = await taxBooks.export(maker, {
      fiscalYearId,
      endDate: '2025-04-20',
      mode: 'DOCUMENT',
      trackingCode: 'PLM-1404-123456',
      format: 'csv',
    });
    const csv = Buffer.from(exp.file.base64, 'base64').toString('utf8');
    expect(csv.startsWith('﻿ردیف,تاریخ,کد حساب کل')).toBe(true);
    expect(await config.get('accounting.locked_until', '')).toBe('2025-04-20');

    // بازه‌ی بعدی خودکار از روز بعد شروع می‌شود؛ بازه‌ی هم‌پوشان ممکن نیست
    const ov2 = await taxBooks.overview(fiscalYearId);
    expect(ov2.next?.startJalali).toBe('1404/02/01');
    await expect(
      taxBooks.preview({
        fiscalYearId,
        endDate: '2025-04-10',
        mode: 'MONTHLY',
      }),
    ).rejects.toThrow(/به بعد باشد/);

    const dl = await taxBooks.download(exp.exportId);
    expect(dl.unchanged).toBe(true);
  });

  it('دفاتر تجاری: فایل ماهانه‌ی اکسل و فایل اصلاحی', async () => {
    const exp = await taxBooks.export(maker, {
      fiscalYearId,
      endDate: '2025-05-21', // پایان اردیبهشت
      mode: 'MONTHLY',
      trackingCode: 'PLM-1404-123456',
      format: 'xlsx',
    });
    expect(exp.period.endJalali).toBe('1404/02/31');
    expect(exp.hasErrors).toBe(false);
    // اردیبهشت: وام، کارمزد (انتقال طلا بین 1020 و 1027 هم ریالی است)
    const zip = await JSZip.loadAsync(Buffer.from(exp.file.base64, 'base64'));
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    expect(sheet).toContain('1404/02/31');
    expect(sheet).toContain('جمع عملیات اردیبهشت 1404');

    const fix = await taxBooks.export(maker, {
      fiscalYearId,
      mode: 'MONTHLY',
      replaceExportId: exp.exportId,
      trackingCode: 'PLM-1404-123456',
      format: 'csv',
    });
    expect(fix.period.endJalali).toBe('1404/02/31');
    const list = await taxBooks.overview(fiscalYearId);
    expect(list.exports.find((e) => e.id === exp.exportId)?.status).toBe(
      'SUPERSEDED',
    );
    expect(list.next?.startJalali).toBe('1404/03/01');
    await expect(
      taxBooks.export(maker, {
        fiscalYearId,
        mode: 'MONTHLY',
        replaceExportId: exp.exportId,
        trackingCode: 'x-1',
        format: 'csv',
      }),
    ).rejects.toThrow(/فقط فایل فعال/);
  });
});
