import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface LedgerLine {
  accountCode: string;
  side: 'DEBIT' | 'CREDIT';
  amountRial?: number;
  amountGrams?: number;
}

const ACCOUNTS = [
  {
    code: '1001',
    name: 'دارایی طلای مشتریان',
    type: 'ASSET',
    subType: 'gold_asset',
  },
  {
    code: '1002',
    name: 'دارایی ریالی مشتریان',
    type: 'ASSET',
    subType: 'rial_asset',
  },
  {
    code: '2001',
    name: 'بدهی به مشتریان',
    type: 'LIABILITY',
    subType: 'customer_liability',
  },
  { code: '4001', name: 'درآمد کارمزد', type: 'INCOME', subType: 'fee_income' },
  {
    code: '4002',
    name: 'مالیات دریافتنی',
    type: 'LIABILITY',
    subType: 'tax_payable',
  },
  {
    code: '5001',
    name: 'هزینه‌های عملیاتی',
    type: 'EXPENSE',
    subType: 'operational',
  },
] as const;

@Injectable()
export class AccountingService implements OnModuleInit {
  private readonly logger = new Logger(AccountingService.name);
  private accountMap = new Map<string, string>(); // code → id

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.initAccounts();
  }

  private async initAccounts() {
    for (const acc of ACCOUNTS) {
      const existing = await this.prisma.account.findUnique({
        where: { code: acc.code },
      });
      if (!existing) {
        const created = await this.prisma.account.create({
          data: {
            code: acc.code,
            name: acc.name,
            type: acc.type,
            subType: acc.subType,
          },
        });
        this.accountMap.set(acc.code, created.id);
        this.logger.log(
          `[Accounting] حساب ساخته شد: ${acc.code} - ${acc.name}`,
        );
      } else {
        this.accountMap.set(acc.code, existing.id);
      }
    }
  }

  private async getAccountId(code: string): Promise<string> {
    if (this.accountMap.has(code)) return this.accountMap.get(code);
    const acc = await this.prisma.account.findUnique({ where: { code } });
    if (!acc) throw new Error(`حساب ${code} یافت نشد`);
    this.accountMap.set(code, acc.id);
    return acc.id;
  }

  // ── ثبت سند حسابداری دوطرفه ──
  async createJournalEntry(
    transactionId: string | null,
    description: string,
    lines: LedgerLine[],
  ) {
    const totalRial = lines
      .filter((l) => l.side === 'DEBIT')
      .reduce((s, l) => s + (l.amountRial ?? 0), 0);
    const totalGrams = lines
      .filter((l) => l.side === 'DEBIT')
      .reduce((s, l) => s + (l.amountGrams ?? 0), 0);

    const ledgerEntries = await Promise.all(
      lines.map(async (line) => ({
        accountId: await this.getAccountId(line.accountCode),
        side: line.side,
        amountRial: line.amountRial ?? 0,
        amountGrams: line.amountGrams ?? 0,
      })),
    );

    return this.prisma.journalEntry.create({
      data: {
        transactionId,
        description,
        totalRial,
        totalGrams,
        ledgerEntries: { create: ledgerEntries },
      },
      include: { ledgerEntries: true },
    });
  }

  // ── سند واریز ──
  async recordDeposit(transactionId: string, amountRial: number) {
    return this.createJournalEntry(
      transactionId,
      `واریز ریالی ${amountRial.toLocaleString('fa-IR')} تومان`,
      [
        { accountCode: '1002', side: 'DEBIT', amountRial },
        { accountCode: '2001', side: 'CREDIT', amountRial },
      ],
    );
  }

  // ── سند برداشت ──
  async recordWithdrawal(transactionId: string, amountRial: number) {
    return this.createJournalEntry(
      transactionId,
      `برداشت ریالی ${amountRial.toLocaleString('fa-IR')} تومان`,
      [
        { accountCode: '2001', side: 'DEBIT', amountRial },
        { accountCode: '1002', side: 'CREDIT', amountRial },
      ],
    );
  }

  // ── سند خرید طلا ──
  async recordBuyGold(
    transactionId: string,
    amountGrams: number,
    amountRial: number,
    feeRial: number,
    taxRial: number,
  ) {
    return this.createJournalEntry(transactionId, `خرید ${amountGrams}g طلا`, [
      { accountCode: '1001', side: 'DEBIT', amountGrams },
      {
        accountCode: '1002',
        side: 'CREDIT',
        amountRial: amountRial + feeRial + taxRial,
      },
      { accountCode: '4001', side: 'CREDIT', amountRial: feeRial },
      { accountCode: '4002', side: 'CREDIT', amountRial: taxRial },
    ]);
  }
}
