// api/src/accounting/accounting-admin.service.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import Decimal from 'decimal.js';

interface ListJournalQuery {
  page?: number;
  limit?: number;
  from?: string;
  to?: string;
  search?: string;
  source?: string;
  referenceNumber?: number;
  accountCode?: string;
  withLines?: boolean;
}

/** تبدیل ایمن مقادیر ورودی/دیتابیس به Decimal از decimal.js */
function toDecimal(value: unknown): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value as Decimal.Value);
}

@Injectable()
export class AccountingAdminService {
  constructor(private prisma: PrismaService) {}

  async listJournalEntries(query: ListJournalQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 30), 100);

    const where: Prisma.JournalEntryWhereInput = {};

    if (query.search) {
      where.description = { contains: query.search, mode: 'insensitive' };
    }
    if (query.source) where.source = query.source as never;
    if (query.referenceNumber) {
      where.OR = [
        { referenceNumber: query.referenceNumber },
        { permanentNumber: query.referenceNumber },
      ];
    }
    if (query.accountCode) {
      where.ledgerEntries = { some: { account: { code: query.accountCode } } };
    }

    if (query.from || query.to) {
      where.entryDate = {};
      if (query.from) {
        where.entryDate.gte = new Date(query.from);
      }
      if (query.to) {
        const toDate = new Date(query.to);
        toDate.setHours(23, 59, 59, 999);
        where.entryDate.lte = toDate;
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.journalEntry.findMany({
        where,
        orderBy: [{ entryDate: 'desc' }, { referenceNumber: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: query.withLines
          ? { ledgerEntries: { include: { account: true } } }
          : undefined,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      data: items.map((j) => ({
        id: j.id,
        description: j.description,
        referenceNumber: j.referenceNumber,
        permanentNumber: j.permanentNumber,
        source: j.source,
        referenceType: j.referenceType,
        referenceId: j.referenceId,
        reversalOfId: j.reversalOfId,
        totalRial: toDecimal(j.totalRial).toString(),
        totalToman: toDecimal(j.totalRial).dividedBy(10).toString(),
        totalGrams: toDecimal(j.totalGrams).toString(),
        entryDate: j.entryDate.toISOString(),
        createdAt: j.createdAt.toISOString(),
        lines:
          'ledgerEntries' in j
            ? (
                j.ledgerEntries as {
                  side: string;
                  amountRial: unknown;
                  amountGrams: unknown;
                  description: string | null;
                  account: { code: string; name: string };
                }[]
              ).map((l) => ({
                accountCode: l.account.code,
                accountName: l.account.name,
                side: l.side,
                amountRial: toDecimal(l.amountRial).toString(),
                amountGrams: toDecimal(l.amountGrams).toString(),
                description: l.description,
              }))
            : undefined,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getJournalEntryDetail(id: string) {
    const journal = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: {
        ledgerEntries: { include: { account: true } },
        reversedBy: { select: { id: true, referenceNumber: true } },
        reversalOf: { select: { id: true, referenceNumber: true } },
      },
    });
    if (!journal) return null;

    const createdBy = journal.createdByAdminId
      ? await this.prisma.adminUser.findUnique({
          where: { id: journal.createdByAdminId },
          select: { fullName: true },
        })
      : null;

    return {
      id: journal.id,
      description: journal.description,
      referenceNumber: journal.referenceNumber,
      permanentNumber: journal.permanentNumber,
      finalizedAt: journal.finalizedAt?.toISOString() ?? null,
      source: journal.source,
      referenceType: journal.referenceType,
      referenceId: journal.referenceId,
      createdBy: createdBy?.fullName ?? null,
      reversedBy: journal.reversedBy,
      reversalOf: journal.reversalOf,
      totalRial: toDecimal(journal.totalRial).toString(),
      totalToman: toDecimal(journal.totalRial).dividedBy(10).toString(),
      totalGrams: toDecimal(journal.totalGrams).toString(),
      entryDate: journal.entryDate.toISOString(),
      createdAt: journal.createdAt.toISOString(),
      lines: journal.ledgerEntries.map((l) => ({
        accountCode: l.account.code,
        accountName: l.account.name,
        side: l.side,
        description: l.description,
        amountRial: toDecimal(l.amountRial).toString(),
        amountToman: toDecimal(l.amountRial).dividedBy(10).toString(),
        amountGrams: toDecimal(l.amountGrams).toString(),
      })),
    };
  }

  async getSummary() {
    // 👈 ۱. دریافت یکجای تمام حساب‌های مورد نیاز در یک کوئری به جای ۶ کوئری
    const targetCodes = ['1010', '1020', '2010', '2020', '4010', '4020'];
    const accounts = await this.prisma.account.findMany({
      where: { code: { in: targetCodes } },
    });

    const accountMap = new Map(accounts.map((a) => [a.code, a]));

    const cash = accountMap.get('1010');
    const goldInventory = accountMap.get('1020');
    const rialLiability = accountMap.get('2010');
    const goldLiability = accountMap.get('2020');
    const feeIncomeAcc = accountMap.get('4010');
    const shopIncomeAcc = accountMap.get('4020');

    // 👈 ۲. محاسبه همزمان درآمد امروز برای دو حساب درآمدی
    const [feeIncomeToday, shopIncomeToday] = await Promise.all([
      this.getTodayIncomeByAccountId(feeIncomeAcc?.id),
      this.getTodayIncomeByAccountId(shopIncomeAcc?.id),
    ]);

    return {
      cashToman: toDecimal(cash?.balanceRial).dividedBy(10).toString(),
      goldInventoryGrams: toDecimal(goldInventory?.balanceGrams).toString(),
      rialLiabilityToman: toDecimal(rialLiability?.balanceRial)
        .dividedBy(10)
        .toString(),
      goldLiabilityGrams: toDecimal(goldLiability?.balanceGrams).toString(),
      feeIncomeTodayToman: feeIncomeToday,
      shopIncomeTodayToman: shopIncomeToday,
    };
  }

  private async getTodayIncomeByAccountId(accountId?: string): Promise<string> {
    if (!accountId) return '0';

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // 👈 محاسبه درآمد خالص امروز (بستانکار منفی بدهکار جهت اعمال اصلاحی‌ها)
    const [creditResult, debitResult] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: {
          accountId,
          side: 'CREDIT',
          createdAt: { gte: startOfDay },
        },
        _sum: { amountRial: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: {
          accountId,
          side: 'DEBIT',
          createdAt: { gte: startOfDay },
        },
        _sum: { amountRial: true },
      }),
    ]);

    const totalCredit = toDecimal(creditResult._sum.amountRial);
    const totalDebit = toDecimal(debitResult._sum.amountRial);
    const netIncomeRial = totalCredit.minus(totalDebit);

    return netIncomeRial.dividedBy(10).toString();
  }
}
