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
}

interface AccountLedgerQuery {
  page?: number;
  limit?: number;
}

/** تبدیل ایمن مقادیر ورودی/دیتابیس به Decimal از decimal.js */
function toDecimal(value: unknown): Decimal {
  if (value === null || value === undefined) return new Decimal(0);
  return new Decimal(value as Decimal.Value);
}

@Injectable()
export class AccountingAdminService {
  constructor(private prisma: PrismaService) {}

  private isDebitNature(code: string): boolean {
    return code.startsWith('1') || code.startsWith('5');
  }

  async listAccounts() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
    });

    return accounts.map((a) => {
      const balRial = toDecimal(a.balanceRial);
      return {
        id: a.id,
        code: a.code,
        name: a.name,
        type: a.type,
        subType: a.subType,
        balanceRial: balRial.toString(),
        balanceToman: balRial.dividedBy(10).toString(),
        balanceGrams: toDecimal(a.balanceGrams).toString(),
        isDebitNature: this.isDebitNature(a.code),
      };
    });
  }

  async getAccountLedger(accountId: string, query: AccountLedgerQuery) {
    // 👈 جلوگیری از اعداد منفی در صفحه‌بندی
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 30), 100);

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
    });
    if (!account) return null;

    const [entries, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where: { accountId },
        include: { journalEntry: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ledgerEntry.count({ where: { accountId } }),
    ]);

    const accBalRial = toDecimal(account.balanceRial);

    return {
      account: {
        code: account.code,
        name: account.name,
        balanceRial: accBalRial.toString(),
        balanceToman: accBalRial.dividedBy(10).toString(),
      },
      data: entries.map((e) => {
        const amountRial = toDecimal(e.amountRial);
        return {
          id: e.id,
          side: e.side,
          amountRial: amountRial.toString(),
          amountToman: amountRial.dividedBy(10).toString(),
          amountGrams: toDecimal(e.amountGrams).toString(),
          description: e.journalEntry.description,
          journalEntryId: e.journalEntryId,
          createdAt: e.createdAt.toISOString(),
        };
      }),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async listJournalEntries(query: ListJournalQuery) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 30), 100);

    const where: Prisma.JournalEntryWhereInput = {};

    if (query.search) {
      where.description = { contains: query.search, mode: 'insensitive' };
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
        orderBy: { entryDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);

    return {
      data: items.map((j) => ({
        id: j.id,
        description: j.description,
        totalToman: toDecimal(j.totalRial).dividedBy(10).toString(),
        totalGrams: toDecimal(j.totalGrams).toString(),
        entryDate: j.entryDate.toISOString(),
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
      include: { ledgerEntries: { include: { account: true } } },
    });
    if (!journal) return null;

    return {
      id: journal.id,
      description: journal.description,
      totalToman: toDecimal(journal.totalRial).dividedBy(10).toString(),
      totalGrams: toDecimal(journal.totalGrams).toString(),
      entryDate: journal.entryDate.toISOString(),
      lines: journal.ledgerEntries.map((l) => ({
        accountCode: l.account.code,
        accountName: l.account.name,
        side: l.side,
        amountToman: toDecimal(l.amountRial).dividedBy(10).toString(),
        amountGrams: toDecimal(l.amountGrams).toString(),
      })),
    };
  }

  async getTrialBalance() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
    });

    let totalDebitRial = new Decimal(0);
    let totalCreditRial = new Decimal(0);

    const rows = accounts.map((a) => {
      const isDebit = this.isDebitNature(a.code);
      const balanceRial = toDecimal(a.balanceRial);

      let debitRial = new Decimal(0);
      let creditRial = new Decimal(0);

      if (isDebit && balanceRial.greaterThan(0)) {
        debitRial = balanceRial;
      } else if (!isDebit && balanceRial.lessThan(0)) {
        debitRial = balanceRial.abs();
      }

      if (!isDebit && balanceRial.greaterThan(0)) {
        creditRial = balanceRial;
      } else if (isDebit && balanceRial.lessThan(0)) {
        creditRial = balanceRial.abs();
      }

      totalDebitRial = totalDebitRial.plus(debitRial);
      totalCreditRial = totalCreditRial.plus(creditRial);

      return {
        code: a.code,
        name: a.name,
        debitToman: debitRial.dividedBy(10).toString(),
        creditToman: creditRial.dividedBy(10).toString(),
      };
    });

    return {
      rows,
      totalDebitToman: totalDebitRial.dividedBy(10).toString(),
      totalCreditToman: totalCreditRial.dividedBy(10).toString(),
      isBalanced: totalDebitRial.equals(totalCreditRial),
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
