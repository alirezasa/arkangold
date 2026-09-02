// api/src/accounting/accounting.service.ts

import {
  Injectable,
  OnModuleInit,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Account } from '../generated/prisma/client';
import { CHART_OF_ACCOUNTS_DEFAULTS } from './accounts.seed';
import Decimal from 'decimal.js'; // 👈 اضافه شده

// ─────────────────────────────────────────────
// ورودی هر سطر سند حسابداری
// ─────────────────────────────────────────────
export type DecimalInput = Decimal | number | string; // 👈 اصلاح شده

export interface LedgerLineInput {
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountRial?: DecimalInput;
  amountGrams?: DecimalInput;
}

export interface JournalInput {
  description: string;
  totalRial: DecimalInput;
  totalGrams: DecimalInput;
  lines: LedgerLineInput[];
}

/** سطر نرمال‌شده: از این نقطه به بعد همه‌چیز Decimal قطعی است */
interface NormalizedLine {
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountRial: Decimal; // 👈 اصلاح شده
  amountGrams: Decimal; // 👈 اصلاح شده
}

/** تبدیل ایمن ورودی به Decimal؛ nullish → صفر */
function toDecimal(value: DecimalInput | null | undefined): Decimal {
  // 👈 اصلاح شده
  if (value === null || value === undefined) return new Decimal(0); // 👈 اصلاح شده
  return value instanceof Decimal ? value : new Decimal(value); // 👈 اصلاح شده
}

const zero = (): Decimal => new Decimal(0); // 👈 اصلاح شده

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
        await this.prisma.account.upsert({
          where: { code: acc.code },
          create: acc,
          update: { name: acc.name, subType: acc.subType },
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
    }));

    // ── ۲. رد سند نامتوازن قبل از هر نوشتنی ──
    this.assertBalanced(lines, description);

    // ── ۳. واکشی حساب‌ها با یک کوئری + fail-fast ──
    const codes = [...new Set(lines.map((l) => l.accountCode))];
    const accounts = await this.getRequiredAccounts(tx, codes);

    // ── ۴. ثبت سند و سطرها ──
    const journal = await tx.journalEntry.create({
      data: { description, totalRial, totalGrams },
    });

    await tx.ledgerEntry.createMany({
      data: lines.map((l) => ({
        journalEntryId: journal.id,
        accountId: accounts[l.accountCode].id,
        side: l.side,
        amountRial: l.amountRial,
        amountGrams: l.amountGrams,
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
   * جهت اثر بر مانده بر اساس ماهیت حساب:
   * کد 1xxx (دارایی) و 5xxx (هزینه) ماهیت بدهکار دارند؛
   * بقیه (بدهی/درآمد/سرمایه) ماهیت بستانکار.
   */
  private deltaSign(account: Account, side: 'DEBIT' | 'CREDIT'): number {
    const debitNature =
      account.code.startsWith('1') || account.code.startsWith('5');
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
