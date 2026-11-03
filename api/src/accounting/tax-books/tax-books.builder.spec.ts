import * as JSZip from 'jszip';
import {
  TbAccount,
  TbJournal,
  TbOptions,
  buildTaxBook,
  sanitizeDescription,
  toCsv,
  toXlsx,
} from './tax-books.builder';

const accounts: TbAccount[] = [
  {
    id: 'a1010',
    code: '1010',
    name: 'موجودی نقد و بانک (ریال)',
    parentId: null,
  },
  {
    id: 'a101001',
    code: '101001',
    name: 'بانک ملت — جاری تجاری',
    parentId: 'a1010',
  },
  {
    id: 'a1020',
    code: '1020',
    name: 'موجودی طلای آب‌شده خزانه',
    parentId: null,
  },
  { id: 'a2020', code: '2020', name: 'بدهی طلایی به کاربران', parentId: null },
  { id: 'a4020', code: '4020', name: 'درآمد فروش فروشگاه', parentId: null },
  {
    id: 'a5170',
    code: '5170',
    name: 'هزینه‌های اداری و عمومی',
    parentId: null,
  },
  { id: 'a517001', code: '517001', name: 'ملزومات اداری', parentId: 'a5170' },
  {
    id: 'a51700101',
    code: '51700101',
    name: 'کاغذ و لوازم‌التحریر',
    parentId: 'a517001',
  },
  { id: 'a3010', code: '3010', name: 'سرمایه', parentId: null },
];

// سال مالی ۱۴۰۴: 2025-03-21 تا 2026-03-20؛ بازه‌ی فایل: فروردین و اردیبهشت
const opts = (o: Partial<TbOptions> = {}): TbOptions => ({
  mode: 'DOCUMENT',
  fiscalYearId: 'fy1404',
  fiscalFirstDay: { y: 2025, m: 3, d: 21 },
  fiscalLastDay: { y: 2026, m: 3, d: 20 },
  periodFirstDay: { y: 2025, m: 3, d: 21 },
  periodLastDay: { y: 2025, m: 5, d: 21 },
  ...o,
});

let ref = 100;
const j = (
  p: Partial<TbJournal> & { lines: TbJournal['lines'] },
): TbJournal => ({
  id: `j${ref}`,
  referenceNumber: ref++,
  permanentNumber: null,
  fiscalYearId: 'fy1404',
  entryDate: new Date('2025-04-10T08:00:00Z'),
  description: 'سند',
  source: 'SYSTEM',
  ...p,
});

describe('tax books builder', () => {
  it('maps kol/moein, uses Tehran date and permanent number, skips gram-only lines', () => {
    const r = buildTaxBook(
      [
        j({
          permanentNumber: 7,
          // ۰۱:۰۰ بامداد تهران ۱ اردیبهشت = 21:30 UTC روز قبل
          entryDate: new Date('2025-04-20T21:30:00Z'),
          description: 'فروش فروشگاه سفارش ۱۲',
          lines: [
            { accountId: 'a101001', side: 'DEBIT', amountRial: '5000000' },
            { accountId: 'a4020', side: 'CREDIT', amountRial: '5000000' },
            { accountId: 'a1020', side: 'DEBIT', amountRial: '0' },
            { accountId: 'a2020', side: 'CREDIT', amountRial: '0' },
          ],
        }),
      ],
      accounts,
      opts(),
    );
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(r.records).toEqual([
      {
        row: 7,
        date: '1404/02/01',
        kolCode: '1010',
        kolName: 'موجودی نقد و بانک (ریال)',
        moeinCode: '101001',
        moeinName: 'بانک ملت — جاری تجاری',
        description: 'فروش فروشگاه سفارش ۱۲',
        debitRial: '5000000',
        creditRial: '0',
      },
      {
        row: 7,
        date: '1404/02/01',
        kolCode: '4020',
        kolName: 'درآمد فروش فروشگاه',
        moeinCode: '',
        moeinName: '',
        description: 'فروش فروشگاه سفارش ۱۲',
        debitRial: '0',
        creditRial: '5000000',
      },
    ]);
    expect(r.totalDebitRial).toBe('5000000');
    expect(r.totalCreditRial).toBe('5000000');
  });

  it('drops pure gram journals and flags unfinalized documents', () => {
    const r = buildTaxBook(
      [
        j({
          lines: [
            { accountId: 'a1020', side: 'DEBIT', amountRial: '0' },
            { accountId: 'a2020', side: 'CREDIT', amountRial: '0' },
          ],
        }),
        j({
          lines: [
            { accountId: 'a101001', side: 'DEBIT', amountRial: '10' },
            { accountId: 'a3010', side: 'CREDIT', amountRial: '10' },
          ],
        }),
      ],
      accounts,
      opts(),
    );
    expect(r.journalCount).toBe(1);
    expect(
      r.issues.some((i) => i.level === 'error' && i.message.includes('قطعی')),
    ).toBe(true);
    expect(
      r.issues.some((i) => i.level === 'warning' && i.message.includes('وزنی')),
    ).toBe(true);
  });

  it('puts deeper (tafsili) accounts under their level-2 moein with the leaf name in the description', () => {
    const r = buildTaxBook(
      [
        j({
          permanentNumber: 1,
          description: 'خرید کاغذ',
          lines: [
            { accountId: 'a51700101', side: 'DEBIT', amountRial: '2000000' },
            { accountId: 'a101001', side: 'CREDIT', amountRial: '2000000' },
          ],
        }),
      ],
      accounts,
      opts(),
    );
    expect(r.records[0]).toMatchObject({
      kolCode: '5170',
      moeinCode: '517001',
      description: 'کاغذ و لوازم‌التحریر — خرید کاغذ',
    });
  });

  it('aggregates by Jalali month with month-end dates, separate opening row, sequential rows', () => {
    const lines = (amount: string) => [
      { accountId: 'a101001', side: 'DEBIT' as const, amountRial: amount },
      { accountId: 'a4020', side: 'CREDIT' as const, amountRial: amount },
    ];
    const r = buildTaxBook(
      [
        j({ entryDate: new Date('2025-04-01T10:00:00Z'), lines: lines('100') }),
        j({ entryDate: new Date('2025-04-05T10:00:00Z'), lines: lines('200') }),
        j({ entryDate: new Date('2025-04-25T10:00:00Z'), lines: lines('50') }),
        j({
          source: 'OPENING',
          entryDate: new Date('2025-03-21T00:00:00Z'),
          lines: [
            { accountId: 'a101001', side: 'DEBIT', amountRial: '1000' },
            { accountId: 'a3010', side: 'CREDIT', amountRial: '1000' },
          ],
        }),
      ],
      accounts,
      opts({ mode: 'MONTHLY' }),
    );
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
    const rows = r.records.map((x) => [
      x.row,
      x.date,
      x.kolCode,
      x.debitRial,
      x.creditRial,
    ]);
    expect(rows).toEqual([
      [1, '1404/01/01', '1010', '1000', '0'],
      [1, '1404/01/01', '3010', '0', '1000'],
      [2, '1404/01/31', '1010', '300', '0'],
      [2, '1404/01/31', '4020', '0', '300'],
      [3, '1404/02/31', '1010', '50', '0'],
      [3, '1404/02/31', '4020', '0', '50'],
    ]);
    expect(r.records[2].description).toBe('جمع عملیات فروردین 1404');
  });

  it('clips the last monthly row to the period end', () => {
    const r = buildTaxBook(
      [
        j({
          entryDate: new Date('2025-04-25T10:00:00Z'),
          lines: [
            { accountId: 'a101001', side: 'DEBIT', amountRial: '5' },
            { accountId: 'a4020', side: 'CREDIT', amountRial: '5' },
          ],
        }),
      ],
      accounts,
      opts({ mode: 'MONTHLY', periodLastDay: { y: 2025, m: 5, d: 5 } }),
    );
    expect(r.records[0].date).toBe('1404/02/15');
  });

  it('dates the closing entry on the last day of the fiscal year', () => {
    const r = buildTaxBook(
      [
        j({
          permanentNumber: 50,
          source: 'CLOSING',
          entryDate: new Date('2026-03-20T23:59:59.999Z'), // ۰۳:۲۹ تهران ۱ فروردین سال بعد
          lines: [
            { accountId: 'a4020', side: 'DEBIT', amountRial: '9' },
            { accountId: 'a3010', side: 'CREDIT', amountRial: '9' },
          ],
        }),
      ],
      accounts,
      opts({
        periodFirstDay: { y: 2026, m: 3, d: 1 },
        periodLastDay: { y: 2026, m: 3, d: 20 },
      }),
    );
    expect(r.records[0].date).toBe('1404/12/29');
    expect(r.issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('reports unbalanced rows and out-of-period dates', () => {
    const r = buildTaxBook(
      [
        j({
          permanentNumber: 3,
          entryDate: new Date('2025-07-01T10:00:00Z'),
          lines: [
            { accountId: 'a101001', side: 'DEBIT', amountRial: '10' },
            { accountId: 'a4020', side: 'CREDIT', amountRial: '9' },
          ],
        }),
      ],
      accounts,
      opts(),
    );
    const msgs = r.issues
      .filter((i) => i.level === 'error')
      .map((i) => i.message);
    expect(msgs.some((m) => m.includes('برابر نیست'))).toBe(true);
    expect(msgs.some((m) => m.includes('خارج از بازه'))).toBe(true);
  });

  it('sanitizes descriptions: newlines, formula prefixes, 255 chars', () => {
    expect(sanitizeDescription('=HYPERLINK("x")\nخط دوم')).toBe(
      'HYPERLINK("x") خط دوم',
    );
    expect(sanitizeDescription('-  منفی')).toBe('منفی');
    expect([...sanitizeDescription('ب'.repeat(400))].length).toBe(255);
    expect(sanitizeDescription(null)).toBe('');
  });

  it('writes CSV with BOM, exact headers and quoted fields', () => {
    const buf = toCsv([
      {
        row: 1,
        date: '1404/01/31',
        kolCode: '1010',
        kolName: 'صندوق',
        moeinCode: '',
        moeinName: '',
        description: 'فروش، "ویژه"',
        debitRial: '10000000',
        creditRial: '0',
      },
    ]);
    const text = buf.toString('utf8');
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, line] = text.slice(1).split('\r\n');
    expect(header).toBe(
      'ردیف,تاریخ,کد حساب کل,عنوان حساب کل,کد حساب معین,عنوان حساب معین,شرح,مبلغ بدهکار (ریال),مبلغ بستانکار (ریال)',
    );
    expect(line).toBe('1,1404/01/31,1010,صندوق,,,"فروش، ""ویژه""",10000000,0');
  });

  it('writes a single-sheet RTL xlsx with numeric amount cells', async () => {
    const buf = await toXlsx([
      {
        row: 2,
        date: '1404/01/31',
        kolCode: '40',
        kolName: 'هزینه',
        moeinCode: '',
        moeinName: '',
        description: 'هزینه <فروردین>',
        debitRial: '6000000',
        creditRial: '0',
      },
    ]);
    const zip = await JSZip.loadAsync(buf);
    const sheet = await zip.file('xl/worksheets/sheet1.xml')?.async('string');
    const workbook = await zip.file('xl/workbook.xml')?.async('string');
    expect((workbook.match(/<sheet /g) ?? []).length).toBe(1);
    expect(sheet).toContain('rightToLeft="1"');
    expect(sheet).toContain('<c r="H2"><v>6000000</v></c>');
    expect(sheet).toContain('<c r="A2"><v>2</v></c>');
    expect(sheet).toContain('هزینه &lt;فروردین&gt;');
    expect(sheet).toContain('1404/01/31');
  });
});
