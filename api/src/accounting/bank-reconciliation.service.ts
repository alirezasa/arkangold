// api/src/accounting/bank-reconciliation.service.ts
//
// مغایرت‌گیری بانکی: سطرهای دفتر یک حساب بانک (1010 یا معین‌های آن) با صورتحساب بانک تطبیق
// داده می‌شوند. مانده‌ی سطرهای تطبیق‌شده تا تاریخ صورتحساب باید با مانده‌ی صورتحساب برابر باشد؛
// سطرهای تطبیق‌نشده «واریز/پرداخت در راه» هستند.
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toDecimal } from './accounting.service';
import { endOfDay } from './accounting-reports.service';

@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  private async bankAccount(code: string) {
    if (!/^1010\d*$/.test(code)) {
      throw new BadRequestException(
        'مغایرت‌گیری فقط برای حساب نقد و بانک (1010 و معین‌ها) است',
      );
    }
    const acc = await this.prisma.account.findUnique({
      where: { code },
      include: { _count: { select: { children: true } } },
    });
    if (!acc) throw new NotFoundException('حساب یافت نشد');
    return acc;
  }

  /** وضعیت حساب تا تاریخ صورتحساب: مانده‌ی دفتر، تطبیق‌شده و سطرهای باز */
  async workspace(code: string, statementDate: string) {
    const acc = await this.bankAccount(code);
    const until = endOfDay(statementDate);
    if (Number.isNaN(until.getTime()))
      throw new BadRequestException('تاریخ صورتحساب نامعتبر است');

    const [bookAgg, clearedAgg, open, last, history] = await Promise.all([
      this.prisma.$queryRaw<{ bal: Prisma.Decimal | null }[]>`
        SELECT SUM(CASE WHEN le."side" = 'DEBIT' THEN le."amount_rial" ELSE -le."amount_rial" END) AS bal
        FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
        WHERE le."account_id" = ${acc.id}::uuid AND je."entry_date" <= ${until}`,
      this.prisma.$queryRaw<{ bal: Prisma.Decimal | null }[]>`
        SELECT SUM(CASE WHEN le."side" = 'DEBIT' THEN le."amount_rial" ELSE -le."amount_rial" END) AS bal
        FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
        WHERE le."account_id" = ${acc.id}::uuid AND je."entry_date" <= ${until} AND le."reconciled_at" IS NOT NULL`,
      this.prisma.ledgerEntry.findMany({
        where: {
          accountId: acc.id,
          reconciledAt: null,
          journalEntry: { entryDate: { lte: until } },
        },
        include: {
          journalEntry: {
            select: {
              id: true,
              referenceNumber: true,
              entryDate: true,
              description: true,
              referenceType: true,
            },
          },
        },
        orderBy: { journalEntry: { entryDate: 'asc' } },
        take: 1000,
      }),
      this.prisma.bankReconciliation.findFirst({
        where: { accountId: acc.id },
        orderBy: { statementDate: 'desc' },
      }),
      this.prisma.bankReconciliation.findMany({
        where: { accountId: acc.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      account: {
        code: acc.code,
        name: acc.name,
        hasChildren: acc._count.children > 0,
      },
      statementDate: until.toISOString(),
      bookBalanceRial: toDecimal(bookAgg[0]?.bal).toString(),
      clearedBalanceRial: toDecimal(clearedAgg[0]?.bal).toString(),
      openEntries: open.map((l) => ({
        id: l.id,
        side: l.side,
        amountRial: l.amountRial.toString(),
        description: l.description ?? l.journalEntry.description,
        journalId: l.journalEntry.id,
        referenceNumber: l.journalEntry.referenceNumber,
        referenceType: l.journalEntry.referenceType,
        entryDate: l.journalEntry.entryDate,
      })),
      lastReconciliation: last,
      history: history.map((h) => ({
        ...h,
        statementBalanceRial: h.statementBalanceRial.toString(),
        bookBalanceRial: h.bookBalanceRial.toString(),
        clearedBalanceRial: h.clearedBalanceRial.toString(),
        differenceRial: h.differenceRial.toString(),
        outstandingDebitRial: h.outstandingDebitRial.toString(),
        outstandingCreditRial: h.outstandingCreditRial.toString(),
      })),
    };
  }

  /**
   * ثبت مغایرت‌گیری: سطرهای انتخاب‌شده «تطبیق‌شده» علامت می‌خورند. ثبت فقط وقتی مجاز است که
   * مانده‌ی تطبیق‌شده با مانده‌ی صورتحساب برابر باشد (یا با allowDifference و ثبت توضیح).
   */
  async reconcile(
    adminId: string,
    dto: {
      accountCode: string;
      statementDate: string;
      statementBalanceRial: string;
      entryIds: string[];
      note?: string;
      allowDifference?: boolean;
    },
  ) {
    const acc = await this.bankAccount(dto.accountCode);
    const until = endOfDay(dto.statementDate);
    let statementBalance: Decimal;
    try {
      statementBalance = new Decimal(dto.statementBalanceRial);
    } catch {
      throw new BadRequestException('مانده‌ی صورتحساب نامعتبر است');
    }
    if (!statementBalance.isInteger())
      throw new BadRequestException('مانده‌ی صورتحساب باید ریال صحیح باشد');

    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'bank-rec:' + acc.id}))`;
      const ids = [...new Set(dto.entryIds)];
      const entries = ids.length
        ? await tx.ledgerEntry.findMany({
            where: { id: { in: ids } },
            include: { journalEntry: { select: { entryDate: true } } },
          })
        : [];
      if (entries.length !== ids.length)
        throw new BadRequestException('برخی سطرهای انتخاب‌شده یافت نشد');
      for (const e of entries) {
        if (e.accountId !== acc.id)
          throw new BadRequestException(
            'سطر انتخاب‌شده متعلق به این حساب نیست',
          );
        if (e.reconciledAt)
          throw new ConflictException('برخی سطرها قبلاً تطبیق شده‌اند');
        if (e.journalEntry.entryDate > until) {
          throw new BadRequestException(
            'سطر با تاریخ بعد از تاریخ صورتحساب قابل تطبیق نیست',
          );
        }
      }

      const sumSql = async (onlyCleared: boolean) => {
        const r = await tx.$queryRaw<{ bal: Prisma.Decimal | null }[]>`
          SELECT SUM(CASE WHEN le."side" = 'DEBIT' THEN le."amount_rial" ELSE -le."amount_rial" END) AS bal
          FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
          WHERE le."account_id" = ${acc.id}::uuid AND je."entry_date" <= ${until}
            AND (${!onlyCleared} OR le."reconciled_at" IS NOT NULL)`;
        return toDecimal(r[0]?.bal);
      };
      const book = await sumSql(false);
      const previouslyCleared = await sumSql(true);
      const newlyCleared = entries.reduce(
        (s, e) =>
          e.side === 'DEBIT'
            ? s.plus(toDecimal(e.amountRial))
            : s.minus(toDecimal(e.amountRial)),
        new Decimal(0),
      );
      const cleared = previouslyCleared.plus(newlyCleared);
      const difference = statementBalance.minus(cleared);
      if (!difference.isZero() && !dto.allowDifference) {
        throw new BadRequestException(
          `مانده‌ی تطبیق‌شده (${cleared.toString()}) با مانده‌ی صورتحساب (${statementBalance.toString()}) برابر نیست؛ اختلاف ${difference.toString()} ریال`,
        );
      }
      if (!difference.isZero() && !(dto.note && dto.note.trim().length >= 5)) {
        throw new BadRequestException('برای ثبت با اختلاف، توضیح الزامی است');
      }

      // اقلام در راه: سطرهای دفتر تا تاریخ صورتحساب که تطبیق نشده‌اند
      const outstanding = await tx.$queryRaw<
        { dr: Prisma.Decimal | null; cr: Prisma.Decimal | null }[]
      >`
        SELECT SUM(CASE WHEN le."side" = 'DEBIT' THEN le."amount_rial" ELSE 0 END) AS dr,
               SUM(CASE WHEN le."side" = 'CREDIT' THEN le."amount_rial" ELSE 0 END) AS cr
        FROM "ledger_entries" le JOIN "journal_entries" je ON je."id" = le."journal_entry_id"
        WHERE le."account_id" = ${acc.id}::uuid AND je."entry_date" <= ${until}
          AND le."reconciled_at" IS NULL
          AND NOT (le."id" = ANY(${ids}::uuid[]))`;

      const rec = await tx.bankReconciliation.create({
        data: {
          accountId: acc.id,
          statementDate: until,
          statementBalanceRial: statementBalance,
          bookBalanceRial: book,
          clearedBalanceRial: cleared,
          differenceRial: difference,
          outstandingDebitRial: toDecimal(outstanding[0]?.dr),
          outstandingCreditRial: toDecimal(outstanding[0]?.cr),
          note: dto.note?.trim() || null,
          createdById: adminId,
        },
      });
      if (ids.length) {
        await tx.ledgerEntry.updateMany({
          where: { id: { in: ids } },
          data: { reconciledAt: new Date(), reconciliationId: rec.id },
        });
      }
      return {
        message: difference.isZero()
          ? 'مغایرت‌گیری بانکی ثبت شد؛ مانده‌ی دفتر با صورتحساب تطبیق دارد'
          : `مغایرت‌گیری با اختلاف ${difference.toString()} ریال ثبت شد`,
        id: rec.id,
      };
    });
  }

  /** برگرداندن آخرین مغایرت‌گیری حساب (برای اصلاح اشتباه) */
  async undoLast(code: string) {
    const acc = await this.bankAccount(code);
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.bankReconciliation.findFirst({
        where: { accountId: acc.id },
        orderBy: { createdAt: 'desc' },
      });
      if (!last)
        throw new NotFoundException('مغایرت‌گیری ثبت‌شده‌ای وجود ندارد');
      await tx.ledgerEntry.updateMany({
        where: { reconciliationId: last.id },
        data: { reconciledAt: null, reconciliationId: null },
      });
      await tx.bankReconciliation.delete({ where: { id: last.id } });
      return { message: 'آخرین مغایرت‌گیری برگردانده شد' };
    });
  }
}
