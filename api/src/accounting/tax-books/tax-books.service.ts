// api/src/accounting/tax-books/tax-books.service.ts
//
// «سامانه‌ی دفاتر تجاری الکترونیکی» سازمان امور مالیاتی:
//   • هر بارگذاری مربوط به یک کد رهگیری پلمپ و یک سال مالی است
//   • ابتدای بازه خودکار است: اولین فایل = شروع سال مالی، بعدی‌ها = روز بعد از پایان فایل قبلی
//   • انتهای بازه را کاربر تعیین می‌کند (روزی گذشته و داخل سال مالی)؛ بازه‌ها هم‌پوشانی ندارند
//   • اصلاح: فایل جایگزین همان بازه ساخته می‌شود و فایل قبلی «جایگزین‌شده» علامت می‌خورد
//   • پس از ثبت، دوره تا پایان بازه قفل می‌شود تا داده‌ی بارگذاری‌شده بعداً تغییر نکند

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TaxBookExport } from '../../generated/prisma/client';
import { SystemConfigService } from '../../system-config/system-config.service';
import {
  YMD,
  addDays,
  compareDay,
  fiscalYearRange,
  formatIsoDay,
  formatJalaliKey,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToGregorian,
  parseIsoDay,
  tehranDayStart,
  tehranGregorian,
  tehranJalali,
} from '../../common/utils/tehran-time';
import {
  CSV_MAX_BYTES,
  DEFAULT_TAX_BOOK_HEADERS,
  TaxBookMode,
  TbJournal,
  XLSX_MAX_RECORDS,
  buildTaxBook,
  toCsv,
  toXlsx,
} from './tax-books.builder';

export type TaxBookFormat = 'csv' | 'xlsx';

export interface TaxBookRequest {
  fiscalYearId: string;
  /** پایان بازه (YYYY-MM-DD میلادی، روز تقویمی تهران) */
  endDate?: string;
  mode: TaxBookMode;
  includeClosing?: boolean;
  /** ساخت فایل جایگزین برای همان بازه‌ی یک فایل قبلی */
  replaceExportId?: string;
}

export interface TaxBookExportRequest extends TaxBookRequest {
  trackingCode: string;
  format: TaxBookFormat;
  /** قفل دوره تا پایان بازه پس از ثبت (پیش‌فرض: بله) */
  lockPeriod?: boolean;
  note?: string;
}

const HEADERS_KEY = 'taxbooks.headers';
const LOCK_KEY = 'accounting.locked_until';

@Injectable()
export class TaxBooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SystemConfigService,
  ) {}

  // ═══════════════════════════════════════════
  // وضعیت: سال‌های مالی، فایل‌های قبلی، بازه‌ی بعدی
  // ═══════════════════════════════════════════
  async overview(fiscalYearId?: string) {
    const years = await this.prisma.fiscalYear.findMany({
      orderBy: { startDate: 'desc' },
    });
    const today = tehranGregorian(new Date());
    const current =
      years.find((y) => y.id === fiscalYearId) ??
      years.find((y) => {
        const r = fiscalYearRange(y);
        return (
          compareDay(r.firstDay, today) <= 0 &&
          compareDay(today, r.lastDay) <= 0
        );
      }) ??
      years[0];
    const exports: TaxBookExport[] = current
      ? await this.prisma.taxBookExport.findMany({
          where: { fiscalYearId: current.id },
          orderBy: [{ periodEnd: 'desc' }, { createdAt: 'desc' }],
        })
      : [];
    const [lock, headers] = await Promise.all([
      this.config.get(LOCK_KEY, ''),
      this.headers(),
    ]);

    let next: {
      start: string;
      startJalali: string;
      suggestedEnd: string | null;
      maxEnd: string;
      completed: boolean;
    } | null = null;
    if (current) {
      const r = fiscalYearRange(current);
      const start = await this.nextStart(current.id, r.firstDay);
      const yesterday = addDays(today, -1);
      const maxEnd =
        compareDay(yesterday, r.lastDay) < 0 ? yesterday : r.lastDay;
      // پیشنهاد: آخرین روز ماه شمسی گذشته (برای تجمیع ماهانه‌ی تمیز)
      const tj = tehranJalali(new Date());
      const prevMonth =
        tj.m === 1 ? { y: tj.y - 1, m: 12 } : { y: tj.y, m: tj.m - 1 };
      let suggested = jalaliToGregorian({
        y: prevMonth.y,
        m: prevMonth.m,
        d: jalaliMonthLength(prevMonth.y, prevMonth.m),
      });
      if (compareDay(suggested, maxEnd) > 0) suggested = maxEnd;
      next = {
        start: formatIsoDay(start),
        startJalali: formatJalaliKey(gregorianToJalali(start)),
        suggestedEnd:
          compareDay(suggested, start) >= 0 ? formatIsoDay(suggested) : null,
        maxEnd: formatIsoDay(maxEnd),
        completed: compareDay(start, r.lastDay) > 0,
      };
    }

    return {
      fiscalYears: years.map((y) => {
        const r = fiscalYearRange(y);
        return {
          id: y.id,
          title: y.title,
          status: y.status,
          firstDay: formatIsoDay(r.firstDay),
          lastDay: formatIsoDay(r.lastDay),
          firstDayJalali: formatJalaliKey(gregorianToJalali(r.firstDay)),
          lastDayJalali: formatJalaliKey(gregorianToJalali(r.lastDay)),
        };
      }),
      fiscalYearId: current?.id ?? null,
      lockedUntil: lock || null,
      headers,
      limits: { xlsxMaxRecords: XLSX_MAX_RECORDS, csvMaxBytes: CSV_MAX_BYTES },
      next,
      exports: exports.map((e) => ({
        id: e.id,
        trackingCode: e.trackingCode,
        periodStart: e.periodStart,
        periodEnd: e.periodEnd,
        periodStartJalali: e.periodStartJalali,
        periodEndJalali: e.periodEndJalali,
        mode: e.mode,
        format: e.format,
        includeClosing: e.includeClosing,
        journalCount: e.journalCount,
        recordCount: e.recordCount,
        totalDebitRial: e.totalDebitRial.toString(),
        totalCreditRial: e.totalCreditRial.toString(),
        status: e.status,
        note: e.note,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  // ═══════════════════════════════════════════
  // پیش‌نمایش و کنترل‌ها (بدون ثبت)
  // ═══════════════════════════════════════════
  async preview(req: TaxBookRequest) {
    const built = await this.build(req);
    return {
      ...this.summary(built),
      sample: built.result.records.slice(0, 300),
    };
  }

  // ═══════════════════════════════════════════
  // ثبت فایل و دریافت
  // ═══════════════════════════════════════════
  async export(adminId: string, req: TaxBookExportRequest) {
    const trackingCode = req.trackingCode?.trim();
    if (!trackingCode) {
      throw new BadRequestException('کد رهگیری پلمپ دفاتر الزامی است');
    }
    if (req.replaceExportId) {
      const prev = await this.prisma.taxBookExport.findUnique({
        where: { id: req.replaceExportId },
        select: { status: true },
      });
      if (prev?.status !== 'ACTIVE') {
        throw new ConflictException(
          'فقط فایل فعال (جایگزین‌نشده) را می‌توان اصلاح کرد',
        );
      }
    }
    const built = await this.build(req);
    const errors = built.result.issues.filter((i) => i.level === 'error');
    if (errors.length) {
      throw new BadRequestException(
        `فایل خطا دارد و ساخته نشد: ${errors
          .slice(0, 3)
          .map((e) => e.message)
          .join(' | ')}`,
      );
    }
    if (!built.result.records.length) {
      throw new BadRequestException('در این بازه سند ریالی وجود ندارد');
    }
    const file = await this.render(built, req.format);

    const created = await this.prisma.$transaction(async (tx) => {
      // جلوگیری از ثبت هم‌زمان دو فایل برای یک سال مالی
      await tx.$executeRaw`SELECT 1 FROM "fiscal_years" WHERE "id" = ${built.year.id}::uuid FOR UPDATE`;
      if (!req.replaceExportId) {
        const start = await this.nextStart(
          built.year.id,
          built.fiscalFirst,
          tx,
        );
        if (compareDay(start, built.first) !== 0) {
          throw new ConflictException(
            'فایل دیگری هم‌زمان برای این سال مالی ثبت شد؛ صفحه را تازه کنید',
          );
        }
      }
      const row = await tx.taxBookExport.create({
        data: {
          fiscalYearId: built.year.id,
          trackingCode: trackingCode.slice(0, 100),
          periodStart: formatIsoDay(built.first),
          periodEnd: formatIsoDay(built.last),
          periodStartJalali: formatJalaliKey(gregorianToJalali(built.first)),
          periodEndJalali: formatJalaliKey(gregorianToJalali(built.last)),
          mode: req.mode,
          format: req.format,
          includeClosing: built.includeClosing,
          journalCount: built.result.journalCount,
          recordCount: built.result.records.length,
          totalDebitRial: built.result.totalDebitRial,
          totalCreditRial: built.result.totalCreditRial,
          contentSha256: built.result.contentSha256,
          note: req.note?.trim().slice(0, 500) || null,
          createdByAdminId: adminId,
        },
      });
      if (req.replaceExportId) {
        await tx.taxBookExport.update({
          where: { id: req.replaceExportId },
          data: { status: 'SUPERSEDED', supersededById: row.id },
        });
      }
      return row;
    });

    let locked: string | null = null;
    if (req.lockPeriod !== false) {
      const end = formatIsoDay(built.last);
      const current = await this.config.get(LOCK_KEY, '');
      if (!current || current < end) {
        await this.config.set(LOCK_KEY, end);
        locked = end;
      }
    }

    return {
      message: `فایل دفاتر تجاری بازه‌ی ${formatJalaliKey(gregorianToJalali(built.first))} تا ${formatJalaliKey(gregorianToJalali(built.last))} ثبت شد${locked ? ` و دوره تا ${locked} قفل گردید` : ''}`,
      exportId: created.id,
      ...this.summary(built),
      file,
    };
  }

  /** دریافت دوباره‌ی فایل یک بارگذاری قبلی (با همان پارامترها) و کنترل تغییر داده */
  async download(id: string, format?: TaxBookFormat) {
    const e = await this.prisma.taxBookExport.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('فایل یافت نشد');
    const built = await this.build({
      fiscalYearId: e.fiscalYearId,
      endDate: e.periodEnd,
      mode: e.mode,
      includeClosing: e.includeClosing,
      replaceExportId: e.id,
    });
    const file = await this.render(
      built,
      format ?? (e.format === 'xlsx' ? 'xlsx' : 'csv'),
    );
    const unchanged = built.result.contentSha256 === e.contentSha256;
    return {
      unchanged,
      message: unchanged
        ? 'محتوای فایل با نسخه‌ی ثبت‌شده یکسان است'
        : 'هشدار: اسناد این بازه پس از ثبت فایل تغییر کرده‌اند؛ فایل جدید با فایل بارگذاری‌شده فرق دارد — در صورت نیاز «فایل اصلاحی» بسازید',
      ...this.summary(built),
      file,
    };
  }

  // ═══════════════════════════════════════════
  // داخلی
  // ═══════════════════════════════════════════
  private async headers(): Promise<string[]> {
    const raw = (await this.config.get(HEADERS_KEY, '')).trim();
    if (raw) {
      const parts = raw.split('|').map((p) => p.trim());
      if (parts.length === 9 && parts.every(Boolean)) return parts;
    }
    return [...DEFAULT_TAX_BOOK_HEADERS];
  }

  private async nextStart(
    fiscalYearId: string,
    fiscalFirst: YMD,
    tx: Pick<PrismaService, 'taxBookExport'> = this.prisma,
  ): Promise<YMD> {
    const last = await tx.taxBookExport.findFirst({
      where: { fiscalYearId, status: 'ACTIVE' },
      orderBy: { periodEnd: 'desc' },
    });
    if (!last) return fiscalFirst;
    const end = parseIsoDay(last.periodEnd);
    return end ? addDays(end, 1) : fiscalFirst;
  }

  private async build(req: TaxBookRequest) {
    if (req.mode !== 'DOCUMENT' && req.mode !== 'MONTHLY') {
      throw new BadRequestException('نوع فایل باید سندبه‌سند یا ماهانه باشد');
    }
    const year = await this.prisma.fiscalYear.findUnique({
      where: { id: req.fiscalYearId },
    });
    if (!year) throw new NotFoundException('سال مالی یافت نشد');
    const range = fiscalYearRange(year);
    const includeClosing = req.includeClosing !== false;

    let first: YMD;
    let last: YMD;
    if (req.replaceExportId) {
      const prev = await this.prisma.taxBookExport.findUnique({
        where: { id: req.replaceExportId },
      });
      if (!prev || prev.fiscalYearId !== year.id) {
        throw new NotFoundException('فایل قبلی برای جایگزینی یافت نشد');
      }
      const s = parseIsoDay(prev.periodStart);
      const e = parseIsoDay(prev.periodEnd);
      if (!s || !e)
        throw new BadRequestException('بازه‌ی فایل قبلی نامعتبر است');
      first = s;
      last = e;
    } else {
      first = await this.nextStart(year.id, range.firstDay);
      const end = req.endDate ? parseIsoDay(req.endDate.slice(0, 10)) : null;
      if (!end) {
        throw new BadRequestException(
          'تاریخ پایان بازه (YYYY-MM-DD) الزامی است',
        );
      }
      last = end;
    }

    const fj = (d: YMD) => formatJalaliKey(gregorianToJalali(d));
    if (compareDay(first, range.lastDay) > 0) {
      throw new BadRequestException(
        `همه‌ی بازه‌های سال مالی «${year.title}» قبلاً بارگذاری شده‌اند`,
      );
    }
    if (compareDay(last, first) < 0) {
      throw new BadRequestException(
        `پایان بازه باید از ${fj(first)} (ابتدای خودکار بازه) به بعد باشد`,
      );
    }
    if (compareDay(last, range.lastDay) > 0) {
      throw new BadRequestException(
        `پایان بازه نمی‌تواند بعد از پایان سال مالی (${fj(range.lastDay)}) باشد`,
      );
    }
    if (compareDay(last, tehranGregorian(new Date())) >= 0) {
      throw new BadRequestException(
        'پایان بازه باید روزی گذشته باشد تا اسناد آن روز کامل شده باشند',
      );
    }

    const gte = tehranDayStart(first);
    const lt = tehranDayStart(addDays(last, 1));
    const closingInPeriod =
      includeClosing && compareDay(range.lastDay, last) <= 0;
    const [journals, accounts] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where: {
          OR: [
            { entryDate: { gte, lt }, source: { not: 'CLOSING' } },
            ...(closingInPeriod
              ? [
                  {
                    source: 'CLOSING' as const,
                    referenceType: 'FISCAL_YEAR',
                    referenceId: year.id,
                  },
                ]
              : []),
          ],
        },
        orderBy: [{ entryDate: 'asc' }, { referenceNumber: 'asc' }],
        select: {
          id: true,
          referenceNumber: true,
          permanentNumber: true,
          fiscalYearId: true,
          entryDate: true,
          description: true,
          source: true,
          ledgerEntries: {
            select: {
              accountId: true,
              side: true,
              amountRial: true,
              description: true,
            },
          },
        },
      }),
      this.prisma.account.findMany({
        select: { id: true, code: true, name: true, parentId: true },
      }),
    ]);

    const tbJournals: TbJournal[] = journals.map((j) => ({
      id: j.id,
      referenceNumber: j.referenceNumber,
      permanentNumber: j.permanentNumber,
      fiscalYearId: j.fiscalYearId,
      entryDate: j.entryDate,
      description: j.description,
      source: j.source,
      lines: j.ledgerEntries.map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amountRial: l.amountRial.toString(),
        description: l.description,
      })),
    }));

    const result = buildTaxBook(tbJournals, accounts, {
      mode: req.mode,
      fiscalYearId: year.id,
      fiscalFirstDay: range.firstDay,
      fiscalLastDay: range.lastDay,
      periodFirstDay: first,
      periodLastDay: last,
    });
    return {
      year,
      first,
      last,
      fiscalFirst: range.firstDay,
      includeClosing,
      mode: req.mode,
      result,
      headers: await this.headers(),
    };
  }

  private summary(b: Awaited<ReturnType<TaxBooksService['build']>>) {
    const recordCount = b.result.records.length;
    return {
      fiscalYear: { id: b.year.id, title: b.year.title },
      period: {
        start: formatIsoDay(b.first),
        end: formatIsoDay(b.last),
        startJalali: formatJalaliKey(gregorianToJalali(b.first)),
        endJalali: formatJalaliKey(gregorianToJalali(b.last)),
      },
      mode: b.mode,
      includeClosing: b.includeClosing,
      journalCount: b.result.journalCount,
      eventCount: b.result.eventCount,
      recordCount,
      totalDebitRial: b.result.totalDebitRial,
      totalCreditRial: b.result.totalCreditRial,
      balanced: b.result.totalDebitRial === b.result.totalCreditRial,
      issues: b.result.issues,
      hasErrors: b.result.issues.some((i) => i.level === 'error'),
      recommendedFormat: recordCount > XLSX_MAX_RECORDS ? 'csv' : 'xlsx',
      headers: b.headers,
    };
  }

  private async render(
    b: Awaited<ReturnType<TaxBooksService['build']>>,
    format: TaxBookFormat,
  ) {
    if (format !== 'csv' && format !== 'xlsx') {
      throw new BadRequestException('قالب فایل باید csv یا xlsx باشد');
    }
    const records = b.result.records;
    if (format === 'xlsx' && records.length > XLSX_MAX_RECORDS) {
      throw new BadRequestException(
        `فایل‌های بیش از ${XLSX_MAX_RECORDS} رکورد باید با قالب CSV بارگذاری شوند (این فایل ${records.length} رکورد دارد)`,
      );
    }
    const buffer =
      format === 'csv'
        ? toCsv(records, b.headers)
        : await toXlsx(records, b.headers);
    if (format === 'csv' && buffer.length > CSV_MAX_BYTES) {
      throw new BadRequestException(
        'حجم فایل CSV بیش از ۱۰۰ مگابایت است؛ بازه را کوتاه‌تر کنید یا قالب ماهانه را انتخاب کنید',
      );
    }
    const name = `tax-books_${formatJalaliKey(gregorianToJalali(b.first)).replace(/\//g, '-')}_${formatJalaliKey(gregorianToJalali(b.last)).replace(/\//g, '-')}_${b.mode === 'MONTHLY' ? 'monthly' : 'documents'}.${format}`;
    return {
      name,
      contentType:
        format === 'csv'
          ? 'text/csv; charset=utf-8'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length,
      base64: buffer.toString('base64'),
    };
  }
}
