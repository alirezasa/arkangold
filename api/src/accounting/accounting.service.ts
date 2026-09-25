// api/src/accounting/accounting.service.ts

import {
  Injectable,
  OnModuleInit,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Account, JournalSource } from '../generated/prisma/client';
import { CHART_OF_ACCOUNTS_DEFAULTS } from './accounts.seed';
import Decimal from 'decimal.js';

// ─────────────────────────────────────────────
// ورودی هر سطر سند حسابداری
// ─────────────────────────────────────────────
export type DecimalInput = Decimal | number | string | Prisma.Decimal;

export interface LedgerLineInput {
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountRial?: DecimalInput;
  amountGrams?: DecimalInput;
  /** شرح اختصاصی سطر (اختیاری) */
  description?: string;
}

export interface JournalInput {
  description: string;
  totalRial: DecimalInput;
  totalGrams: DecimalInput;
  lines: LedgerLineInput[];
  /** منبع سند — پیش‌فرض SYSTEM (اسناد خودکار عملیات کاربران) */
  source?: JournalSource;
  /** نوع و شناسه‌ی سند عملیاتی مبدأ برای ردیابی دوطرفه */
  referenceType?: string;
  referenceId?: string;
  /** تاریخ سند (فقط اسناد دستی/افتتاحیه/اختتامیه) — پیش‌فرض اکنون */
  entryDate?: Date;
  createdByAdminId?: string | null;
  reversalOfId?: string;
  transactionId?: string;
}

/** سطر نرمال‌شده: از این نقطه به بعد همه‌چیز Decimal قطعی است */
interface NormalizedLine {
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountRial: Decimal;
  amountGrams: Decimal;
  description?: string;
}

/** تبدیل ایمن ورودی به Decimal؛ nullish → صفر */
export function toDecimal(value: DecimalInput | null | undefined): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return value instanceof Decimal ? value : new Decimal(value.toString());
}

const zero = (): Decimal => new Decimal(0);

/** ماهیت حساب از رقم اول کد: 1 (دارایی) و 5 (هزینه) بدهکار؛ بقیه بستانکار */
export function isDebitNature(code: string): boolean {
  return code.startsWith('1') || code.startsWith('5');
}

@Injectable()
export class AccountingService implements OnModuleInit {
  private readonly logger = new Logger(AccountingService.name);

  constructor(private prisma: PrismaService) {}

  // ═══════════════════════════════════════════
  // Seed خودکار در استارت اپ
  // ═══════════════════════════════════════════
  async onModuleInit(): Promise<void> {
    await this.seedChartOfAccounts();
  }

  private async seedChartOfAccounts(): Promise<void> {
    try {
      for (const acc of CHART_OF_ACCOUNTS_DEFAULTS) {
        const data = {
          name: acc.name,
          subType: acc.subType,
          description: acc.description ?? null,
          allowManualEntry: acc.allowManualEntry ?? true,
          isSystem: true,
        };
        await this.prisma.account.upsert({
          where: { code: acc.code },
          create: { code: acc.code, type: acc.type, ...data },
          update: data,
        });
      }
      this.logger.log(
        `[Accounting] ${CHART_OF_ACCOUNTS_DEFAULTS.length} حساب پایه بررسی/seed شد ✅`,
      );
    } catch (err) {
      this.logger.error(
        '[Accounting][ALERT] seed حساب‌های پایه شکست خورد',
        err,
      );
      throw err;
    }
  }

  // ═══════════════════════════════════════════
  // Fail-fast: دریافت حساب‌های الزامی
  // ═══════════════════════════════════════════
  async getRequiredAccounts<T extends string>(
    tx: Prisma.TransactionClient,
    codes: readonly T[],
  ): Promise<Record<T, Account>> {
    const found = await tx.account.findMany({
      where: { code: { in: [...codes] } },
    });

    const result = {} as Record<T, Account>;

    for (const code of codes) {
      const account = found.find((a) => a.code === code);
      if (!account) {
        throw new InternalServerErrorException(
          `حساب پایه '${code}' در دیتابیس یافت نشد. اپلیکیشن را ری‌استارت کنید تا seed اجرا شود`,
        );
      }
      result[code] = account;
    }

    return result;
  }

  // ═══════════════════════════════════════════
  // تنها نقطه ثبت سند در کل سیستم
  // سند + سطرها + به‌روزرسانی مانده‌ها، اتمیک در یک تراکنش
  // ═══════════════════════════════════════════
  async postJournal(
    tx: Prisma.TransactionClient,
    params: JournalInput,
  ): Promise<{ id: string }> {
    const { description } = params;

    // ── ۱. نرمال‌سازی ورودی‌ها به Decimal (تنها مرز تبدیل) ──
    const totalRial = toDecimal(params.totalRial);
    const totalGrams = toDecimal(params.totalGrams);
    const lines: NormalizedLine[] = params.lines.map((l) => ({
      accountCode: l.accountCode,
      side: l.side,
      amountRial: toDecimal(l.amountRial),
      amountGrams: toDecimal(l.amountGrams),
      description: l.description,
    }));

    // ── ۲. رد سند نامتوازن قبل از هر نوشتنی ──
    this.assertBalanced(lines, description);

    // ── ۳. واکشی حساب‌ها با یک کوئری + fail-fast ──
    const codes = [...new Set(lines.map((l) => l.accountCode))];
    const accounts = await this.getRequiredAccounts(tx, codes);
    for (const code of codes) {
      if (accounts[code].isActive === false) {
        throw new BadRequestException(
          `حساب ${code} (${accounts[code].name}) غیرفعال است و ثبت سند روی آن مجاز نیست`,
        );
      }
    }

    // ── ۴. ثبت سند و سطرها ──
    const journal = await tx.journalEntry.create({
      data: {
        description,
        totalRial,
        totalGrams,
        source: params.source ?? 'SYSTEM',
        referenceType: params.referenceType ?? null,
        referenceId: params.referenceId ?? null,
        createdByAdminId: params.createdByAdminId ?? null,
        reversalOfId: params.reversalOfId ?? null,
        transactionId: params.transactionId ?? null,
        ...(params.entryDate ? { entryDate: params.entryDate } : {}),
      },
    });

    await tx.ledgerEntry.createMany({
      data: lines.map((l) => ({
        journalEntryId: journal.id,
        accountId: accounts[l.accountCode].id,
        side: l.side,
        amountRial: l.amountRial,
        amountGrams: l.amountGrams,
        description: l.description ?? null,
      })),
    });

    // ── ۵. به‌روزرسانی مانده‌ها در همان تراکنش ──
    for (const l of lines) {
      const account = accounts[l.accountCode];
      const sign = this.deltaSign(account, l.side);
      const deltaRial = l.amountRial.times(sign);
      const deltaGrams = l.amountGrams.times(sign);

      if (deltaRial.isZero() && deltaGrams.isZero()) continue;

      await tx.account.update({
        where: { id: account.id },
        data: {
          balanceRial: { increment: deltaRial },
          balanceGrams: { increment: deltaGrams },
        },
      });
    }

    return journal;
  }

  /**
   * سند برگشتی: همان سطرها با جهت معکوس. هر سند فقط یک‌بار قابل برگشت است
   * (reversalOfId یکتا در دیتابیس).
   */
  async reverseJournal(
    tx: Prisma.TransactionClient,
    journalId: string,
    opts: {
      description?: string;
      createdByAdminId?: string | null;
      referenceType?: string;
      referenceId?: string;
    } = {},
  ): Promise<{ id: string }> {
    const original = await tx.journalEntry.findUnique({
      where: { id: journalId },
      include: {
        ledgerEntries: { include: { account: { select: { code: true } } } },
        reversedBy: { select: { id: true } },
      },
    });
    if (!original) throw new NotFoundException('سند حسابداری یافت نشد');
    if (original.reversedBy) {
      throw new ConflictException('این سند قبلاً برگشت خورده است');
    }
    if (original.reversalOfId) {
      throw new ConflictException('سند برگشتی را نمی‌توان دوباره برگشت زد');
    }

    return this.postJournal(tx, {
      description:
        opts.description ??
        `برگشت سند عطف ${original.referenceNumber}: ${original.description ?? ''}`,
      totalRial: original.totalRial,
      totalGrams: original.totalGrams,
      source: 'REVERSAL',
      reversalOfId: original.id,
      referenceType: opts.referenceType ?? original.referenceType ?? undefined,
      referenceId: opts.referenceId ?? original.referenceId ?? undefined,
      createdByAdminId: opts.createdByAdminId,
      lines: original.ledgerEntries.map((l) => ({
        accountCode: l.account.code,
        side: l.side === 'DEBIT' ? 'CREDIT' : 'DEBIT',
        amountRial: l.amountRial,
        amountGrams: l.amountGrams,
        description: l.description ?? undefined,
      })),
    });
  }

  // ═══════════════════════════════════════════
  // ارزش‌گذاری
  // ═══════════════════════════════════════════

  /**
   * بهای تمام‌شده‌ی میانگین موزون: گرم × (مانده ریالی ÷ مانده گرمی) حساب.
   * اگر حساب مانده‌ی مثبت گرمی/ریالی نداشته باشد صفر برمی‌گرداند (موجودی افتتاحیه ثبت نشده).
   */
  async averageCostRial(
    tx: Prisma.TransactionClient,
    accountCode: string,
    grams: DecimalInput,
  ): Promise<Decimal> {
    const g = toDecimal(grams);
    if (g.lte(0)) return zero();
    const acc = await tx.account.findUnique({
      where: { code: accountCode },
      select: { balanceRial: true, balanceGrams: true },
    });
    const balG = toDecimal(acc?.balanceGrams);
    const balR = toDecimal(acc?.balanceRial);
    if (balG.lte(0) || balR.lte(0)) return zero();
    const cost = balR.div(balG).times(g).toDecimalPlaces(0);
    // هرگز بیش از کل مانده‌ی ریالی خارج نشود (خروج آخرین گرم‌ها)
    return cost.gt(balR) ? balR : cost;
  }

  /** قیمت لحظه‌ای هر گرم طلای ۱۸ عیار (ریال) از جدول قیمت بازار */
  async currentGoldPriceRial(
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<Decimal> {
    const row = await tx.marketPrice.findUnique({
      where: { metal: 'GOLD' },
      select: { pricePerGramRial: true },
    });
    return toDecimal(row?.pricePerGramRial);
  }

  /**
   * قفل دوره: تاریخ سند دستی باید بعد از تاریخ قفل و داخل یک سال مالی باز باشد
   * (اگر سال مالی تعریف شده باشد).
   */
  async assertPostingDateAllowed(
    tx: Prisma.TransactionClient | PrismaService,
    entryDate: Date,
  ): Promise<void> {
    const lock = await tx.systemConfig.findUnique({
      where: { key: 'accounting.locked_until' },
    });
    if (lock?.value && /^\d{4}-\d{2}-\d{2}/.test(lock.value)) {
      const lockedUntil = new Date(lock.value);
      lockedUntil.setHours(23, 59, 59, 999);
      if (entryDate <= lockedUntil) {
        throw new BadRequestException(
          `دوره‌ی مالی تا تاریخ ${lock.value} قفل است؛ ثبت سند با این تاریخ مجاز نیست`,
        );
      }
    }
    const yearsCount = await tx.fiscalYear.count();
    if (yearsCount === 0) return;
    const year = await tx.fiscalYear.findFirst({
      where: { startDate: { lte: entryDate }, endDate: { gte: entryDate } },
    });
    if (!year) {
      throw new BadRequestException(
        'تاریخ سند در هیچ سال مالی تعریف‌شده‌ای قرار ندارد',
      );
    }
    if (year.status === 'CLOSED') {
      throw new BadRequestException(
        `سال مالی «${year.title}» بسته شده و ثبت سند در آن مجاز نیست`,
      );
    }
  }

  /**
   * جهت اثر بر مانده بر اساس ماهیت حساب:
   * کد 1xxx (دارایی) و 5xxx (هزینه) ماهیت بدهکار دارند؛
   * بقیه (بدهی/درآمد/سرمایه) ماهیت بستانکار.
   */
  private deltaSign(account: Account, side: 'DEBIT' | 'CREDIT'): number {
    const debitNature = isDebitNature(account.code);
    if (side === 'DEBIT') return debitNature ? 1 : -1;
    return debitNature ? -1 : 1;
  }

  /** اصل بنیادین: جمع بدهکار = جمع بستانکار (هم ریال، هم گرم) */
  private assertBalanced(lines: NormalizedLine[], description: string): void {
    let debitRial = zero();
    let creditRial = zero();
    let debitGrams = zero();
    let creditGrams = zero();

    for (const l of lines) {
      if (l.side === 'DEBIT') {
        debitRial = debitRial.plus(l.amountRial);
        debitGrams = debitGrams.plus(l.amountGrams);
      } else {
        creditRial = creditRial.plus(l.amountRial);
        creditGrams = creditGrams.plus(l.amountGrams);
      }
    }

    if (!debitRial.equals(creditRial) || !debitGrams.equals(creditGrams)) {
      this.logger.error(
        `[Accounting][ALERT] سند نامتوازن رد شد: "${description}" | ` +
          `ریال: ${debitRial.toString()} ≠ ${creditRial.toString()} | ` +
          `گرم: ${debitGrams.toString()} ≠ ${creditGrams.toString()}`,
      );
      throw new InternalServerErrorException(
        'خطای داخلی در ثبت سند حسابداری. تراکنش لغو شد',
      );
    }
  }
}
