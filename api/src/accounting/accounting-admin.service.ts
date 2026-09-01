import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

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

    return accounts.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      subType: a.subType,
      balanceRial: a.balanceRial.toString(),
      balanceToman: a.balanceRial.dividedBy(10).toString(),
      balanceGrams: a.balanceGrams.toString(),
      isDebitNature: this.isDebitNature(a.code),
    }));
  }

  async getAccountLedger(accountId: string, query: AccountLedgerQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 30, 100);

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

    return {
      account: {
        code: account.code,
        name: account.name,
        balanceRial: account.balanceRial.toString(),
        balanceToman: account.balanceRial.dividedBy(10).toString(),
      },
      data: entries.map((e) => ({
        id: e.id,
        side: e.side,
        amountRial: e.amountRial.toString(),
        amountToman: e.amountRial.dividedBy(10).toString(),
        amountGrams: e.amountGrams.toString(),
        description: e.journalEntry.description,
        journalEntryId: e.journalEntryId,
        createdAt: e.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async listJournalEntries(query: ListJournalQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 30, 100);

    const where: Prisma.JournalEntryWhereInput = {
      ...(query.search
        ? { description: { contains: query.search, mode: 'insensitive' } }
        : {}),
      ...(query.from || query.to
        ? {
            entryDate: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to
                ? {
                    lte: new Date(new Date(query.to).setHours(23, 59, 59, 999)),
                  }
                : {}),
            },
          }
        : {}),
    };

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
        totalToman: j.totalRial.dividedBy(10).toString(),
        totalGrams: j.totalGrams.toString(),
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
      totalToman: journal.totalRial.dividedBy(10).toString(),
      totalGrams: journal.totalGrams.toString(),
      entryDate: journal.entryDate.toISOString(),
      lines: journal.ledgerEntries.map((l) => ({
        accountCode: l.account.code,
        accountName: l.account.name,
        side: l.side,
        amountToman: l.amountRial.dividedBy(10).toString(),
        amountGrams: l.amountGrams.toString(),
      })),
    };
  }

  async getTrialBalance() {
    const accounts = await this.prisma.account.findMany({
      orderBy: { code: 'asc' },
    });

    let totalDebitRial = new Prisma.Decimal(0);
    let totalCreditRial = new Prisma.Decimal(0);

    const rows = accounts.map((a) => {
      const isDebit = this.isDebitNature(a.code);
      // مانده مثبت طبق ماهیت حساب در ستون خودش نمایش داده می‌شود
      const debitRial =
        isDebit && a.balanceRial.greaterThan(0)
          ? a.balanceRial
          : !isDebit && a.balanceRial.lessThan(0)
            ? a.balanceRial.abs()
            : new Prisma.Decimal(0);
      const creditRial =
        !isDebit && a.balanceRial.greaterThan(0)
          ? a.balanceRial
          : isDebit && a.balanceRial.lessThan(0)
            ? a.balanceRial.abs()
            : new Prisma.Decimal(0);

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
    const [
      cash,
      goldInventory,
      rialLiability,
      goldLiability,
      feeIncomeToday,
      shopIncomeToday,
    ] = await Promise.all([
      this.prisma.account.findUnique({ where: { code: '1010' } }),
      this.prisma.account.findUnique({ where: { code: '1020' } }),
      this.prisma.account.findUnique({ where: { code: '2010' } }),
      this.prisma.account.findUnique({ where: { code: '2020' } }),
      this.getTodayIncome('4010'),
      this.getTodayIncome('4020'),
    ]);

    return {
      cashToman: (cash?.balanceRial ?? new Prisma.Decimal(0))
        .dividedBy(10)
        .toString(),
      goldInventoryGrams: (
        goldInventory?.balanceGrams ?? new Prisma.Decimal(0)
      ).toString(),
      rialLiabilityToman: (rialLiability?.balanceRial ?? new Prisma.Decimal(0))
        .dividedBy(10)
        .toString(),
      goldLiabilityGrams: (
        goldLiability?.balanceGrams ?? new Prisma.Decimal(0)
      ).toString(),
      feeIncomeTodayToman: feeIncomeToday,
      shopIncomeTodayToman: shopIncomeToday,
    };
  }

  private async getTodayIncome(accountCode: string): Promise<string> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const account = await this.prisma.account.findUnique({
      where: { code: accountCode },
    });
    if (!account) return '0';

    const result = await this.prisma.ledgerEntry.aggregate({
      where: {
        accountId: account.id,
        side: 'CREDIT',
        createdAt: { gte: startOfDay },
      },
      _sum: { amountRial: true },
    });

    return (result._sum.amountRial ?? new Prisma.Decimal(0))
      .dividedBy(10)
      .toString();
  }
}
