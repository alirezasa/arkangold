// api/src/accounting/tax-books/tax-books.builder.ts
//
// ساخت فایل «سامانه‌ی دفاتر تجاری الکترونیکی» سازمان امور مالیاتی (راهنمای خرداد ۱۴۰۴)
// — منطق خالص و بدون دیتابیس تا با تست واحد پوشش داده شود.
//
// قالب: یک صفحه و ۹ ستون به این ترتیب:
//   ردیف | تاریخ | کد حساب کل | عنوان حساب کل | کد حساب معین | عنوان حساب معین | شرح |
//   مبلغ بدهکار (ریال) | مبلغ بستانکار (ریال)
// قواعد: هر سطر فقط یک طرف؛ جمع بدهکار = جمع بستانکار در هر «ردیف»؛ ردیف یکسان = تاریخ یکسان؛
// تاریخ YYYY/MM/DD شمسی داخل بازه؛ شرح ≤ ۲۵۵ نویسه؛ مبلغ فقط عدد و ریال؛ هر ردیف حداکثر یک ماه شمسی.

import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import * as JSZip from 'jszip';
import {
  YMD,
  compareDay,
  formatJalaliKey,
  gregorianToJalali,
  jalaliMonthLength,
  tehranJalali,
} from '../../common/utils/tehran-time';

export type TaxBookMode = 'DOCUMENT' | 'MONTHLY';

/** عنوان ستون‌ها مطابق قالب سامانه (قابل جایگزینی از تنظیمات taxbooks.headers) */
export const DEFAULT_TAX_BOOK_HEADERS = [
  'ردیف',
  'تاریخ',
  'کد حساب کل',
  'عنوان حساب کل',
  'کد حساب معین',
  'عنوان حساب معین',
  'شرح',
  'مبلغ بدهکار (ریال)',
  'مبلغ بستانکار (ریال)',
] as const;

/** بیش از این تعداد رکورد باید CSV بارگذاری شود */
export const XLSX_MAX_RECORDS = 1000;
/** سقف حجم فایل CSV در سامانه */
export const CSV_MAX_BYTES = 100 * 1024 * 1024;
export const DESCRIPTION_MAX = 255;

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

export interface TbAccount {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
}

export interface TbLine {
  accountId: string;
  side: 'DEBIT' | 'CREDIT';
  amountRial: Decimal.Value;
  description?: string | null;
}

export interface TbJournal {
  id: string;
  referenceNumber: number;
  permanentNumber: number | null;
  fiscalYearId: string | null;
  entryDate: Date;
  description: string | null;
  source: string;
  lines: TbLine[];
}

export interface TbOptions {
  mode: TaxBookMode;
  fiscalYearId: string;
  /** روز اول و آخر سال مالی (میلادی) */
  fiscalFirstDay: YMD;
  fiscalLastDay: YMD;
  /** بازه‌ی این فایل (میلادی، شامل هر دو سر) */
  periodFirstDay: YMD;
  periodLastDay: YMD;
}

export interface TbRecord {
  row: number;
  date: string;
  kolCode: string;
  kolName: string;
  moeinCode: string;
  moeinName: string;
  description: string;
  debitRial: string;
  creditRial: string;
}

export interface TbIssue {
  level: 'error' | 'warning';
  message: string;
}

export interface TbResult {
  records: TbRecord[];
  issues: TbIssue[];
  journalCount: number;
  eventCount: number;
  totalDebitRial: string;
  totalCreditRial: string;
  contentSha256: string;
}

/** حذف شکست خط، فاصله‌های اضافه و نویسه‌های شروع فرمول (= + - @) و برش به ۲۵۵ نویسه */
export function sanitizeDescription(v: string | null | undefined): string {
  const text = (v ?? '')
    .replace(/[\r\n\t\p{Cc}]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[=+\-@\s]+/, '')
    .trim();
  return [...text].slice(0, DESCRIPTION_MAX).join('');
}

/** نگاشت حساب به «کل» (ریشه‌ی درخت) و «معین» (سطح دوم)؛ سطح‌های پایین‌تر زیر معین سطح دوم */
export function accountMapper(accounts: TbAccount[]) {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const cache = new Map<
    string,
    { kol: TbAccount; moein: TbAccount | null; leaf: TbAccount; depth: number }
  >();
  return (accountId: string) => {
    const hit = cache.get(accountId);
    if (hit) return hit;
    const chain: TbAccount[] = [];
    let cur = byId.get(accountId);
    while (cur && chain.length < 20) {
      chain.unshift(cur);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (!chain.length) return null;
    const res = {
      kol: chain[0],
      moein: chain.length > 1 ? chain[1] : null,
      leaf: chain[chain.length - 1],
      depth: chain.length,
    };
    cache.set(accountId, res);
    return res;
  };
}

const ymdLte = (a: YMD, b: YMD) => compareDay(a, b) <= 0;
const minDay = (...days: YMD[]) =>
  days.reduce((m, d) => (compareDay(d, m) < 0 ? d : m));

/** تاریخ شمسی سند در فایل: وقت تهران؛ سند اختتامیه همیشه روز پایان سال مالی */
function journalJalali(j: TbJournal, opts: TbOptions): YMD {
  if (j.source === 'CLOSING') return gregorianToJalali(opts.fiscalLastDay);
  return tehranJalali(j.entryDate);
}

export function buildTaxBook(
  journals: TbJournal[],
  accounts: TbAccount[],
  opts: TbOptions,
): TbResult {
  const map = accountMapper(accounts);
  const issues: TbIssue[] = [];
  const periodFirstJ = gregorianToJalali(opts.periodFirstDay);
  const periodLastJ = gregorianToJalali(opts.periodLastDay);
  const fiscalLastJ = gregorianToJalali(opts.fiscalLastDay);

  interface Line {
    kol: TbAccount;
    moein: TbAccount | null;
    side: 'DEBIT' | 'CREDIT';
    amount: Decimal;
    description: string;
  }
  interface Event {
    sortKey: string;
    row: number;
    date: YMD;
    lines: Line[];
    label: string;
  }

  const events: Event[] = [];
  let journalCount = 0;
  let unfinalized = 0;
  let skippedGramOnly = 0;

  const sorted = [...journals].sort(
    (a, b) =>
      a.entryDate.getTime() - b.entryDate.getTime() ||
      a.referenceNumber - b.referenceNumber,
  );

  const toLines = (j: TbJournal): Line[] => {
    const out: Line[] = [];
    for (const l of j.lines) {
      const amount = new Decimal(l.amountRial);
      if (amount.isZero()) continue; // سطرهای فقط‌گرمی (وزنی) در دفاتر ریالی نمی‌آیند
      const m = map(l.accountId);
      if (!m) {
        issues.push({
          level: 'error',
          message: `سند عطف ${j.referenceNumber}: حساب سطر یافت نشد`,
        });
        continue;
      }
      const base = sanitizeDescription(l.description || j.description);
      const description =
        m.depth > 2 ? sanitizeDescription(`${m.leaf.name} — ${base}`) : base;
      out.push({
        kol: m.kol,
        moein: m.moein,
        side: l.side,
        amount: amount.abs(),
        description,
      });
    }
    return out;
  };

  if (opts.mode === 'DOCUMENT') {
    for (const j of sorted) {
      const lines = toLines(j);
      if (!lines.length) {
        skippedGramOnly++;
        continue;
      }
      journalCount++;
      const date = journalJalali(j, opts);
      let row: number;
      if (j.permanentNumber != null && j.fiscalYearId === opts.fiscalYearId) {
        row = j.permanentNumber;
      } else {
        unfinalized++;
        row = j.referenceNumber;
      }
      events.push({
        sortKey: `${String(row).padStart(12, '0')}`,
        row,
        date,
        lines,
        label: `سند ${row} (عطف ${j.referenceNumber})`,
      });
    }
    events.sort((a, b) => a.row - b.row);
    if (unfinalized) {
      issues.push({
        level: 'error',
        message: `${unfinalized} سند در این بازه هنوز قطعی نشده (شماره‌ی قطعی ندارد). ابتدا اسناد را تا پایان بازه قطعی کنید؛ در پیش‌نمایش به‌جای شماره‌ی قطعی، شماره‌ی عطف آمده است.`,
      });
    }
  } else {
    // تجمیع ماهانه: سند افتتاحیه و اختتامیه ردیف جدا، بقیه یک ردیف برای هر ماه شمسی
    const groups = new Map<
      string,
      {
        order: number;
        date: YMD;
        label: string;
        sums: Map<string, Line>;
      }
    >();
    for (const j of sorted) {
      const lines = toLines(j);
      if (!lines.length) {
        skippedGramOnly++;
        continue;
      }
      journalCount++;
      const jd = journalJalali(j, opts);
      const monthEnd: YMD = {
        y: jd.y,
        m: jd.m,
        d: jalaliMonthLength(jd.y, jd.m),
      };
      const kind =
        j.source === 'OPENING'
          ? 'OPENING'
          : j.source === 'CLOSING'
            ? 'CLOSING'
            : 'MONTH';
      const key = kind === 'MONTH' ? `M${jd.y}-${jd.m}` : kind;
      const monthName = `${JALALI_MONTHS[jd.m - 1]} ${jd.y}`;
      let g = groups.get(key);
      if (!g) {
        const date =
          kind === 'OPENING'
            ? jd
            : kind === 'CLOSING'
              ? fiscalLastJ
              : minDay(monthEnd, periodLastJ, fiscalLastJ);
        g = {
          order: kind === 'OPENING' ? 0 : kind === 'CLOSING' ? 2 : 1,
          date,
          label:
            kind === 'OPENING'
              ? 'سند افتتاحیه‌ی حساب‌ها (مانده‌ی انتقالی از سال قبل)'
              : kind === 'CLOSING'
                ? 'سند اختتامیه‌ی حساب‌های موقت'
                : `جمع عملیات ${monthName}`,
          sums: new Map(),
        };
        groups.set(key, g);
      } else if (kind === 'OPENING' && compareDay(jd, g.date) < 0) {
        g.date = jd;
      }
      for (const l of lines) {
        const k = `${l.kol.code}|${l.moein?.code ?? ''}|${l.side}`;
        const cur = g.sums.get(k);
        if (cur) cur.amount = cur.amount.plus(l.amount);
        else g.sums.set(k, { ...l, description: g.label });
      }
    }
    const ordered = [...groups.values()].sort(
      (a, b) => a.order - b.order || compareDay(a.date, b.date),
    );
    ordered.forEach((g, i) => {
      const lines = [...g.sums.values()].sort(
        (a, b) =>
          (a.side === b.side ? 0 : a.side === 'DEBIT' ? -1 : 1) ||
          a.kol.code.localeCompare(b.kol.code) ||
          (a.moein?.code ?? '').localeCompare(b.moein?.code ?? ''),
      );
      events.push({
        sortKey: String(i),
        row: i + 1,
        date: g.date,
        lines,
        label: g.label,
      });
    });
  }

  // ── رکوردها و کنترل‌ها ──
  const records: TbRecord[] = [];
  let totalDr = new Decimal(0);
  let totalCr = new Decimal(0);
  const seenRows = new Set<number>();
  for (const e of events) {
    if (seenRows.has(e.row)) {
      issues.push({
        level: 'error',
        message: `شماره‌ی ردیف ${e.row} تکراری است`,
      });
    }
    seenRows.add(e.row);
    if (!ymdLte(periodFirstJ, e.date) || !ymdLte(e.date, periodLastJ)) {
      issues.push({
        level: 'error',
        message: `${e.label}: تاریخ ${formatJalaliKey(e.date)} خارج از بازه‌ی ${formatJalaliKey(periodFirstJ)} تا ${formatJalaliKey(periodLastJ)} است`,
      });
    }
    let dr = new Decimal(0);
    let cr = new Decimal(0);
    const date = formatJalaliKey(e.date);
    for (const l of e.lines) {
      if (l.side === 'DEBIT') dr = dr.plus(l.amount);
      else cr = cr.plus(l.amount);
      records.push({
        row: e.row,
        date,
        kolCode: l.kol.code,
        kolName: sanitizeDescription(l.kol.name),
        moeinCode: l.moein?.code ?? '',
        moeinName: l.moein ? sanitizeDescription(l.moein.name) : '',
        description: l.description,
        debitRial: l.side === 'DEBIT' ? l.amount.toFixed(0) : '0',
        creditRial: l.side === 'CREDIT' ? l.amount.toFixed(0) : '0',
      });
    }
    if (!dr.equals(cr)) {
      issues.push({
        level: 'error',
        message: `${e.label}: جمع بدهکار ${dr.toFixed(0)} با جمع بستانکار ${cr.toFixed(0)} ریال برابر نیست`,
      });
    }
    totalDr = totalDr.plus(dr);
    totalCr = totalCr.plus(cr);
  }
  if (skippedGramOnly) {
    issues.push({
      level: 'warning',
      message: `${skippedGramOnly} سند فقط وزنی (گرم) بود و مبلغ ریالی نداشت؛ در دفاتر ریالی نمی‌آید`,
    });
  }
  if (!records.length) {
    issues.push({
      level: 'warning',
      message: 'در این بازه هیچ سند ریالی وجود ندارد',
    });
  }

  return {
    records,
    issues,
    journalCount,
    eventCount: events.length,
    totalDebitRial: totalDr.toFixed(0),
    totalCreditRial: totalCr.toFixed(0),
    contentSha256: createHash('sha256')
      .update(JSON.stringify(records))
      .digest('hex'),
  };
}

const recordCells = (r: TbRecord) => [
  String(r.row),
  r.date,
  r.kolCode,
  r.kolName,
  r.moeinCode,
  r.moeinName,
  r.description,
  r.debitRial,
  r.creditRial,
];

/** نشانه‌ی UTF-8 (BOM) تا اکسل و سامانه فارسی را درست بخوانند */
const BOM = String.fromCharCode(0xfeff);

function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** CSV با UTF-8 BOM (نمایش درست فارسی در اکسل) و پایان خط CRLF */
export function toCsv(
  records: TbRecord[],
  headers: readonly string[] = DEFAULT_TAX_BOOK_HEADERS,
): Buffer {
  const lines = [headers.map(csvField).join(',')];
  for (const r of records) lines.push(recordCells(r).map(csvField).join(','));
  return Buffer.from(`${BOM}${lines.join('\r\n')}\r\n`, 'utf8');
}

const xmlEscape = (v: string) =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function colName(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** ستون‌های عددی: ردیف، کد کل، کد معین، بدهکار، بستانکار */
const NUMERIC_COLS = new Set([0, 2, 4, 7, 8]);

/** فایل اکسل (xlsx) تک‌صفحه‌ای راست‌به‌چپ — بدون وابستگی اضافه، با jszip */
export async function toXlsx(
  records: TbRecord[],
  headers: readonly string[] = DEFAULT_TAX_BOOK_HEADERS,
): Promise<Buffer> {
  const cell = (ref: string, v: string, numeric: boolean, header = false) => {
    const style = header ? ' s="1"' : '';
    if (
      numeric &&
      /^\d+$/.test(v) &&
      Number.isSafeInteger(Number(v)) &&
      v.length < 16
    ) {
      return `<c r="${ref}"${style}><v>${v}</v></c>`;
    }
    if (v === '') return '';
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
  };
  const rows: string[] = [];
  rows.push(
    `<row r="1">${headers.map((h, i) => cell(`${colName(i)}1`, h, false, true)).join('')}</row>`,
  );
  records.forEach((r, idx) => {
    const n = idx + 2;
    rows.push(
      `<row r="${n}">${recordCells(r)
        .map((v, i) => cell(`${colName(i)}${n}`, v, NUMERIC_COLS.has(i)))
        .join('')}</row>`,
    );
  });
  const widths = [8, 12, 12, 32, 14, 32, 60, 20, 20];
  const sheet =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${rows.join('')}</sheetData></worksheet>`;

  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    'xl/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
  );
  zip.file('xl/worksheets/sheet1.xml', sheet);
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
