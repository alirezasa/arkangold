// api/src/wallet/wallet-admin.service.ts
//
// چرخه‌ی کامل برداشت ریالی:
//   PENDING (ثبت کاربر، رزرو موجودی) ── تأیید مالی ──► APPROVED (صف پرداخت بانکی)
//   APPROVED ── پرداخت بانکی (شماره پیگیری، حساب مبدأ) ──► PROCESSED
//        کسر قطعی از کیف پول + آزادسازی رزرو + سند:
//          بدهکار 2010 بدهی ریالی به کاربران (کل مبلغ)
//          بستانکار حساب بانک مبدأ (مبلغ خالص واریزی) + بستانکار 4090 درآمد کارمزد (کارمزد)
//   PENDING/APPROVED ── رد ──► REJECTED (آزادسازی رزرو)
//   PENDING ── لغو کاربر ──► CANCELLED
//   PROCESSED ── برگشت وجه از بانک ──► RETURNED (بازگشت کل مبلغ به کیف پول + سند برگشتی)
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, WithdrawalStatus } from '../generated/prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { SmsTemplateService } from '../notifications/sms-template.service';

interface ListWithdrawalsQuery {
  page?: number;
  limit?: number;
  status?: WithdrawalStatus;
  q?: string;
  from?: string;
  to?: string;
  batchId?: string;
}

export interface PayWithdrawalInput {
  sourceAccountCode?: string;
  payoutMethod?: string;
  bankReference: string;
  paidAt?: string;
  note?: string;
}

export const PAYOUT_METHODS = [
  'PAYA',
  'SATNA',
  'POL',
  'CARD_TO_CARD',
  'INTERNAL',
] as const;

const STATUS_FA: Record<WithdrawalStatus, string> = {
  PENDING: 'در انتظار بررسی',
  APPROVED: 'تأییدشده — در صف پرداخت',
  REJECTED: 'ردشده',
  PROCESSED: 'پرداخت‌شده',
  CANCELLED: 'لغو توسط کاربر',
  RETURNED: 'برگشت از بانک',
};

const toman = (rial: Prisma.Decimal | number | string) =>
  Math.round(Number(rial) / 10).toLocaleString('fa-IR');

@Injectable()
export class WalletAdminService {
  private readonly logger = new Logger(WalletAdminService.name);

  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
    private systemConfig: SystemConfigService,
    private smsTemplates: SmsTemplateService,
  ) {}

  private toNumber(value: unknown): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException('مقدار عددی نامعتبر است');
    }
    return numberValue;
  }

  // ═══════════════════════════ فهرست و جزئیات ═══════════════════════════

  private buildWhere(
    query: ListWithdrawalsQuery,
  ): Prisma.WithdrawalRequestWhereInput {
    const q = query.q?.trim();
    return {
      ...(query.status ? { status: query.status } : {}),
      ...(query.batchId ? { payoutBatchId: query.batchId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to
                ? { lt: new Date(new Date(query.to).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
      ...(q
        ? {
            OR: [
              { requestNumber: { contains: q, mode: 'insensitive' } },
              { bankReference: { contains: q } },
              { user: { phone: { contains: q } } },
              { user: { identity: { nationalCode: { contains: q } } } },
              { bankAccount: { sheba: { contains: q.toUpperCase() } } },
            ],
          }
        : {}),
    };
  }

  async list(query: ListWithdrawalsQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 200);
    const where = this.buildWhere(query);

    const [items, total, byStatus, sums] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              identity: {
                select: { firstName: true, lastName: true, nationalCode: true },
              },
              legalProfile: { select: { companyName: true } },
            },
          },
          bankAccount: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.withdrawalRequest.count({ where }),
      this.prisma.withdrawalRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where,
        _sum: { amountRial: true, feeRial: true, netAmountRial: true },
      }),
    ]);

    return {
      data: items.map((w) => this.toRow(w)),
      statusSummary: Object.fromEntries(
        byStatus.map((s) => [
          s.status,
          {
            count: s._count._all,
            amountRial: (s._sum.amountRial ?? 0).toString(),
          },
        ]),
      ),
      totals: {
        amountRial: (sums._sum.amountRial ?? 0).toString(),
        feeRial: (sums._sum.feeRial ?? 0).toString(),
        netAmountRial: (sums._sum.netAmountRial ?? 0).toString(),
      },
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private toRow(
    w: Prisma.WithdrawalRequestGetPayload<{
      include: {
        user: {
          select: {
            id: true;
            phone: true;
            identity: {
              select: { firstName: true; lastName: true; nationalCode: true };
            };
            legalProfile: { select: { companyName: true } };
          };
        };
        bankAccount: true;
      };
    }>,
  ) {
    const snap = (w.destinationSnapshot ?? {}) as Record<string, string | null>;
    return {
      id: w.id,
      requestNumber: w.requestNumber,
      status: w.status,
      statusLabel: STATUS_FA[w.status],
      amountRial: w.amountRial.toString(),
      feeRial: w.feeRial.toString(),
      netAmountRial: (w.netAmountRial ?? w.amountRial).toString(),
      amountToman: (Number(w.amountRial) / 10).toString(),
      adminNotes: w.adminNotes,
      rejectionReason: w.rejectionReason,
      bankReference: w.bankReference,
      payoutMethod: w.payoutMethod,
      payoutBatchId: w.payoutBatchId,
      sourceAccountCode: w.sourceAccountCode,
      user: {
        id: w.user.id,
        phone: w.user.phone,
        fullName:
          w.user.legalProfile?.companyName ??
          (`${w.user.identity?.firstName ?? ''} ${w.user.identity?.lastName ?? ''}`.trim() ||
            null),
        nationalCode: w.user.identity?.nationalCode ?? null,
      },
      bankAccount: {
        bankName: snap.bankName ?? w.bankAccount.bankName,
        cardNumber: snap.cardNumber ?? w.bankAccount.cardNumber,
        sheba: snap.sheba ?? w.bankAccount.sheba,
        accountNumber: snap.accountNumber ?? w.bankAccount.accountNumber,
        isVerified: w.bankAccount.isVerified,
      },
      createdAt: w.createdAt.toISOString(),
      reviewedAt: w.reviewedAt,
      paidAt: w.paidAt,
      returnedAt: w.returnedAt,
      returnReason: w.returnReason,
      journalEntryId: w.journalEntryId,
    };
  }

  async getOne(id: string) {
    const w = await this.prisma.withdrawalRequest.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            status: true,
            createdAt: true,
            identity: {
              select: {
                firstName: true,
                lastName: true,
                nationalCode: true,
                status: true,
              },
            },
            legalProfile: { select: { companyName: true } },
            wallet: { select: { id: true, rialBalance: true } },
          },
        },
        bankAccount: true,
        approvals: {
          orderBy: { createdAt: 'asc' },
          include: { approver: { select: { fullName: true, username: true } } },
        },
      },
    });
    if (!w) throw new NotFoundException('درخواست برداشت یافت نشد');

    const [prevPaid, prevRejected, holds, journal, sms] = await Promise.all([
      this.prisma.withdrawalRequest.aggregate({
        where: { userId: w.userId, status: 'PROCESSED', id: { not: w.id } },
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
      this.prisma.withdrawalRequest.count({
        where: { userId: w.userId, status: 'REJECTED', id: { not: w.id } },
      }),
      w.user.wallet
        ? this.prisma.walletHold.aggregate({
            where: {
              walletId: w.user.wallet.id,
              expiresAt: { gt: new Date() },
            },
            _sum: { amountRial: true },
          })
        : null,
      w.journalEntryId
        ? this.prisma.journalEntry.findUnique({
            where: { id: w.journalEntryId },
            select: {
              id: true,
              referenceNumber: true,
              permanentNumber: true,
              entryDate: true,
            },
          })
        : null,
      this.prisma.smsLog.findMany({
        where: { referenceType: 'WITHDRAWAL', referenceId: w.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, templateKey: true, status: true, createdAt: true },
      }),
    ]);

    const row = this.toRow(w);
    return {
      ...row,
      user: {
        ...row.user,
        status: w.user.status,
        identityStatus: w.user.identity?.status ?? null,
        memberSince: w.user.createdAt,
        walletRialBalance: (w.user.wallet?.rialBalance ?? 0).toString(),
        heldRial: (holds?._sum.amountRial ?? 0).toString(),
      },
      history: {
        paidCount: prevPaid._count._all,
        paidAmountRial: (prevPaid._sum.amountRial ?? 0).toString(),
        rejectedCount: prevRejected,
      },
      approvals: w.approvals.map((a) => ({
        id: a.id,
        status: a.status,
        step: a.step,
        comment: a.comment,
        approver: a.approver.fullName ?? a.approver.username,
        createdAt: a.createdAt,
      })),
      journal,
      smsLogs: sms,
    };
  }

  // ═══════════════════════════ تأیید ═══════════════════════════

  async approve(adminUserId: string, withdrawalId: string, note?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "withdrawal_requests" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`;
      const w = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
      });
      if (!w) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (w.status === 'APPROVED' || w.status === 'PROCESSED') {
        return {
          message: 'این درخواست قبلاً تأیید شده است',
          alreadyProcessed: true,
          w,
        };
      }
      if (w.status !== 'PENDING') {
        throw new ConflictException(
          `درخواست در وضعیت «${STATUS_FA[w.status]}» قابل تأیید نیست`,
        );
      }
      const bank = await tx.bankAccount.findUnique({
        where: { id: w.bankAccountId },
      });
      if (!bank?.isVerified) {
        throw new ConflictException('حساب بانکی مقصد تأییدشده نیست');
      }
      const updated = await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: {
          status: 'APPROVED',
          reviewedById: adminUserId,
          reviewedAt: new Date(),
          adminNotes: note?.trim() || w.adminNotes,
        },
      });
      await tx.approval.create({
        data: {
          requestType: 'WITHDRAWAL',
          requestId: w.id,
          withdrawalRequestId: w.id,
          approverId: adminUserId,
          status: 'APPROVED',
          step: 1,
          comment: note?.trim() || 'تأیید مالی — صف پرداخت',
        },
      });
      return {
        message: 'درخواست تأیید شد و در صف پرداخت بانکی قرار گرفت',
        alreadyProcessed: false,
        w: updated,
      };
    });
    if (!result.alreadyProcessed) {
      void this.notify(result.w, 'WITHDRAWAL_APPROVED');
    }
    return {
      message: result.message,
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  // ═══════════════════════════ پرداخت بانکی ═══════════════════════════

  /** حساب بانک/صندوق مبدأ: کد 1010 یا یکی از معین‌های فعال زیر آن */
  private async resolveSourceAccount(
    tx: Prisma.TransactionClient,
    code: string | undefined,
  ): Promise<string> {
    const fallback = await this.systemConfig.get(
      'withdrawal.default_source_account',
      '1010',
    );
    const chosen = (code?.trim() || fallback || '1010').trim();
    if (!/^1010\d*$/.test(chosen)) {
      throw new BadRequestException(
        'حساب مبدأ پرداخت باید حساب نقد و بانک (1010 یا معین‌های آن) باشد',
      );
    }
    const account = await tx.account.findUnique({ where: { code: chosen } });
    if (!account || !account.isActive) {
      throw new BadRequestException(`حساب ${chosen} یافت نشد یا غیرفعال است`);
    }
    return chosen;
  }

  async pay(
    adminUserId: string,
    withdrawalId: string,
    dto: PayWithdrawalInput,
    batchId?: string,
  ) {
    const bankReference = dto.bankReference?.trim();
    if (!bankReference)
      throw new BadRequestException('شماره پیگیری بانکی الزامی است');
    if (
      dto.payoutMethod &&
      !PAYOUT_METHODS.includes(
        dto.payoutMethod as (typeof PAYOUT_METHODS)[number],
      )
    ) {
      throw new BadRequestException('روش پرداخت نامعتبر است');
    }
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    if (
      Number.isNaN(paidAt.getTime()) ||
      paidAt.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException('تاریخ پرداخت نامعتبر است');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'withdrawal:' + withdrawalId}))`;
      await tx.$executeRaw`SELECT 1 FROM "withdrawal_requests" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`;
      const w = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
      });
      if (!w) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (w.status === 'PROCESSED') {
        return { alreadyProcessed: true as const, w };
      }
      if (w.status !== 'APPROVED') {
        throw new ConflictException(
          w.status === 'PENDING'
            ? 'ابتدا درخواست را تأیید کنید، سپس پرداخت را ثبت کنید'
            : `درخواست در وضعیت «${STATUS_FA[w.status]}» قابل پرداخت نیست`,
        );
      }

      const sourceCode = await this.resolveSourceAccount(
        tx,
        dto.sourceAccountCode,
      );
      const wallet = await tx.wallet.findUnique({
        where: { userId: w.userId },
      });
      if (!wallet) throw new NotFoundException('کیف پول کاربر یافت نشد');
      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`;
      const fresh = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });

      const amount = this.toNumber(w.amountRial);
      const fee = this.toNumber(w.feeRial);
      const net = amount - fee;
      if (this.toNumber(fresh.rialBalance) < amount) {
        throw new BadRequestException(
          'موجودی کیف پول کاربر برای این برداشت کافی نیست',
        );
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { rialBalance: { decrement: amount } },
      });
      if (w.holdId) {
        await tx.walletHold.deleteMany({ where: { id: w.holdId } });
      }
      if (w.transactionId) {
        await tx.transaction.update({
          where: { id: w.transactionId },
          data: { status: 'COMPLETED', feeAmount: fee || null },
        });
      }

      const lines: Parameters<AccountingService['postJournal']>[1]['lines'] = [
        {
          accountCode: '2010',
          side: 'DEBIT',
          amountRial: amount,
          description: 'کسر از کیف پول کاربر',
        },
        {
          accountCode: sourceCode,
          side: 'CREDIT',
          amountRial: net,
          description: `واریز به حساب کاربر — پیگیری ${bankReference}`,
        },
      ];
      if (fee > 0) {
        lines.push({
          accountCode: '4090',
          side: 'CREDIT',
          amountRial: fee,
          description: 'کارمزد برداشت',
        });
      }
      const journal = await this.accountingService.postJournal(tx, {
        description: `پرداخت برداشت ${w.requestNumber ?? w.id} — پیگیری بانکی ${bankReference}`,
        totalRial: amount,
        totalGrams: 0,
        lines,
        referenceType: 'WITHDRAWAL',
        referenceId: w.id,
        createdByAdminId: adminUserId,
        transactionId: w.transactionId ?? undefined,
        entryDate: paidAt,
      });

      const updated = await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: {
          status: 'PROCESSED',
          processedById: adminUserId,
          paidById: adminUserId,
          paidAt,
          bankReference,
          payoutMethod: dto.payoutMethod ?? 'PAYA',
          sourceAccountCode: sourceCode,
          payoutBatchId: batchId ?? null,
          journalEntryId: journal.id,
          adminNotes: dto.note?.trim() || w.adminNotes,
        },
      });
      await tx.approval.create({
        data: {
          requestType: 'WITHDRAWAL',
          requestId: w.id,
          withdrawalRequestId: w.id,
          approverId: adminUserId,
          status: 'APPROVED',
          step: 2,
          comment: `پرداخت بانکی — پیگیری ${bankReference}`,
        },
      });
      return { alreadyProcessed: false as const, w: updated };
    });

    if (!result.alreadyProcessed) {
      void this.notify(result.w, 'WITHDRAWAL_PAID', { bankRef: bankReference });
    }
    return {
      message: result.alreadyProcessed
        ? 'این درخواست قبلاً پرداخت شده است'
        : 'پرداخت ثبت شد و سند حسابداری صادر شد',
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  /** پرداخت گروهی (مثلاً یک فایل پایا): هر درخواست جداگانه و مستقل ثبت می‌شود */
  async payBatch(
    adminUserId: string,
    ids: string[],
    dto: Omit<PayWithdrawalInput, 'bankReference'> & {
      bankReference: string;
      perItemReferences?: Record<string, string>;
    },
  ) {
    if (!ids.length)
      throw new BadRequestException('هیچ درخواستی انتخاب نشده است');
    if (ids.length > 200)
      throw new BadRequestException('حداکثر ۲۰۰ درخواست در هر دسته');
    const batchId = `PB-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const results: { id: string; ok: boolean; message: string }[] = [];
    for (const id of ids) {
      try {
        const ref = dto.perItemReferences?.[id]?.trim() || dto.bankReference;
        const r = await this.pay(
          adminUserId,
          id,
          { ...dto, bankReference: ref },
          batchId,
        );
        results.push({ id, ok: !r.alreadyProcessed, message: r.message });
      } catch (err) {
        results.push({ id, ok: false, message: (err as Error).message });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    return {
      message: `${okCount.toLocaleString('fa-IR')} از ${ids.length.toLocaleString('fa-IR')} درخواست پرداخت شد`,
      batchId,
      results,
    };
  }

  // ═══════════════════════════ رد ═══════════════════════════

  async reject(adminUserId: string, withdrawalId: string, reason: string) {
    const r = reason?.trim();
    if (!r || r.length < 5)
      throw new BadRequestException('دلیل رد را وارد کنید');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "withdrawal_requests" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`;
      const w = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
      });
      if (!w) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (w.status === 'REJECTED') {
        return { alreadyProcessed: true as const, w };
      }
      if (w.status !== 'PENDING' && w.status !== 'APPROVED') {
        throw new ConflictException(
          `درخواست در وضعیت «${STATUS_FA[w.status]}» قابل رد نیست`,
        );
      }
      if (w.holdId) {
        await tx.walletHold.deleteMany({ where: { id: w.holdId } });
      }
      if (w.transactionId) {
        await tx.transaction.update({
          where: { id: w.transactionId },
          data: { status: 'FAILED' },
        });
      }
      const updated = await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: {
          status: 'REJECTED',
          rejectionReason: r,
          adminNotes: r,
          processedById: adminUserId,
          reviewedById: adminUserId,
          reviewedAt: new Date(),
        },
      });
      await tx.approval.create({
        data: {
          requestType: 'WITHDRAWAL',
          requestId: w.id,
          withdrawalRequestId: w.id,
          approverId: adminUserId,
          status: 'REJECTED',
          comment: r,
        },
      });
      return { alreadyProcessed: false as const, w: updated };
    });
    if (!result.alreadyProcessed) {
      void this.notify(result.w, 'WITHDRAWAL_REJECTED', { reason: r });
    }
    return {
      message: result.alreadyProcessed
        ? 'این درخواست قبلاً رد شده است'
        : 'درخواست برداشت رد شد و رزرو موجودی آزاد شد',
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  // ═══════════════════════════ برگشت از بانک ═══════════════════════════

  async markReturned(
    adminUserId: string,
    withdrawalId: string,
    reason: string,
  ) {
    const r = reason?.trim();
    if (!r || r.length < 5)
      throw new BadRequestException('دلیل برگشت وجه را وارد کنید');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'withdrawal:' + withdrawalId}))`;
      await tx.$executeRaw`SELECT 1 FROM "withdrawal_requests" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`;
      const w = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
      });
      if (!w) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (w.status === 'RETURNED')
        return { alreadyProcessed: true as const, w };
      if (w.status !== 'PROCESSED') {
        throw new ConflictException(
          'فقط برداشت پرداخت‌شده قابل ثبت برگشت از بانک است',
        );
      }
      const wallet = await tx.wallet.findUnique({
        where: { userId: w.userId },
      });
      if (!wallet) throw new NotFoundException('کیف پول کاربر یافت نشد');
      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`;

      const amount = this.toNumber(w.amountRial);
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { rialBalance: { increment: amount } },
      });
      await tx.transaction.create({
        data: {
          userId: w.userId,
          walletId: wallet.id,
          type: 'REFUND',
          status: 'COMPLETED',
          amountRial: amount,
          relatedTransactionId: w.transactionId,
          description: `برگشت وجه برداشت ${w.requestNumber ?? w.id} از بانک — ${r}`,
        },
      });

      let returnJournalId: string | null = null;
      if (w.journalEntryId) {
        const rev = await this.accountingService.reverseJournal(
          tx,
          w.journalEntryId,
          {
            description: `برگشت وجه برداشت ${w.requestNumber ?? w.id} از بانک — ${r}`,
            createdByAdminId: adminUserId,
            referenceType: 'WITHDRAWAL_RETURN',
            referenceId: w.id,
          },
        );
        returnJournalId = rev.id;
      } else {
        // برداشت‌های قدیمی بدون پیوند سند: سند معکوس دستی ساده
        const rev = await this.accountingService.postJournal(tx, {
          description: `برگشت وجه برداشت ${w.requestNumber ?? w.id} از بانک — ${r}`,
          totalRial: amount,
          totalGrams: 0,
          lines: [
            {
              accountCode: w.sourceAccountCode ?? '1010',
              side: 'DEBIT',
              amountRial: amount,
            },
            { accountCode: '2010', side: 'CREDIT', amountRial: amount },
          ],
          referenceType: 'WITHDRAWAL_RETURN',
          referenceId: w.id,
          createdByAdminId: adminUserId,
        });
        returnJournalId = rev.id;
      }

      const updated = await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          returnReason: r,
          returnJournalId,
        },
      });
      return { alreadyProcessed: false as const, w: updated };
    });
    if (!result.alreadyProcessed) {
      void this.notify(result.w, 'WITHDRAWAL_RETURNED', { reason: r });
    }
    return {
      message: result.alreadyProcessed
        ? 'برگشت این برداشت قبلاً ثبت شده است'
        : 'برگشت وجه ثبت شد؛ کل مبلغ به کیف پول کاربر بازگشت و سند برگشتی صادر شد',
      alreadyProcessed: result.alreadyProcessed,
    };
  }

  // ═══════════════════════════ گزارش ═══════════════════════════

  /** گزارش دوره‌ای برداشت‌ها: جمع وضعیت‌ها، کارمزد، روزانه و به تفکیک حساب مبدأ */
  async report(from?: string, to?: string) {
    const where = this.buildWhere({ from, to });
    const paidWhere: Prisma.WithdrawalRequestWhereInput = {
      status: { in: ['PROCESSED', 'RETURNED'] },
      ...(from || to
        ? {
            paidAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to
                ? { lt: new Date(new Date(to).getTime() + 86_400_000) }
                : {}),
            },
          }
        : {}),
    };
    const [byStatus, bySource, paidRows, pendingQueue] = await Promise.all([
      this.prisma.withdrawalRequest.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { amountRial: true, feeRial: true },
      }),
      this.prisma.withdrawalRequest.groupBy({
        by: ['sourceAccountCode', 'payoutMethod'],
        where: paidWhere,
        _count: { _all: true },
        _sum: { amountRial: true, feeRial: true, netAmountRial: true },
      }),
      this.prisma.withdrawalRequest.findMany({
        where: paidWhere,
        select: { paidAt: true, amountRial: true, feeRial: true, status: true },
      }),
      this.prisma.withdrawalRequest.aggregate({
        where: { status: { in: ['PENDING', 'APPROVED'] } },
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
    ]);

    const daily = new Map<
      string,
      { count: number; amountRial: number; feeRial: number }
    >();
    for (const r of paidRows) {
      if (!r.paidAt) continue;
      const day = r.paidAt.toISOString().slice(0, 10);
      const d = daily.get(day) ?? { count: 0, amountRial: 0, feeRial: 0 };
      d.count += 1;
      d.amountRial += Number(r.amountRial);
      d.feeRial += Number(r.feeRial);
      daily.set(day, d);
    }

    return {
      byStatus: byStatus.map((s) => ({
        status: s.status,
        label: STATUS_FA[s.status],
        count: s._count._all,
        amountRial: (s._sum.amountRial ?? 0).toString(),
        feeRial: (s._sum.feeRial ?? 0).toString(),
      })),
      bySourceAccount: bySource.map((s) => ({
        sourceAccountCode: s.sourceAccountCode,
        payoutMethod: s.payoutMethod,
        count: s._count._all,
        amountRial: (s._sum.amountRial ?? 0).toString(),
        feeRial: (s._sum.feeRial ?? 0).toString(),
        netAmountRial: (s._sum.netAmountRial ?? 0).toString(),
      })),
      daily: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, v]) => ({
          day,
          ...v,
          amountRial: String(v.amountRial),
          feeRial: String(v.feeRial),
        })),
      openQueue: {
        count: pendingQueue._count._all,
        amountRial: (pendingQueue._sum.amountRial ?? 0).toString(),
      },
    };
  }

  // ═══════════════════════════ پیامک ═══════════════════════════

  private async notify(
    w: {
      id: string;
      userId: string;
      requestNumber: string | null;
      amountRial: Prisma.Decimal;
      netAmountRial: Prisma.Decimal | null;
    },
    key: string,
    extra: Record<string, string> = {},
  ) {
    try {
      await this.smsTemplates.sendToUser(
        key,
        w.userId,
        {
          amount: toman(
            key === 'WITHDRAWAL_PAID'
              ? (w.netAmountRial ?? w.amountRial)
              : w.amountRial,
          ),
          requestNumber: w.requestNumber ?? w.id.slice(0, 8),
          ...extra,
        },
        { referenceType: 'WITHDRAWAL', referenceId: w.id },
      );
    } catch (err) {
      this.logger.warn(
        `پیامک ${key} برداشت ${w.id} ارسال نشد: ${(err as Error).message}`,
      );
    }
  }

  // ═══════════════════════════ تنظیم دستی کیف پول ═══════════════════════════

  async adjustBalance(
    adminUserId: string,
    userId: string,
    amountRial: number,
    amountGrams: number,
    description: string,
  ) {
    if (!amountRial && !amountGrams) {
      throw new BadRequestException(
        'حداقل یکی از مقادیر ریالی یا گرمی باید غیر صفر باشد',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('کیف پول کاربر یافت نشد');

      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`;

      if (amountRial < 0) {
        const currentRial = this.toNumber(wallet.rialBalance);
        if (currentRial + amountRial < 0) {
          throw new BadRequestException(
            'موجودی ریالی کاربر برای این کسر کافی نیست',
          );
        }
      }
      if (amountGrams < 0) {
        const currentGrams = this.toNumber(wallet.goldBalanceGrams);
        if (currentGrams + amountGrams < 0) {
          throw new BadRequestException(
            'موجودی طلای کاربر برای این کسر کافی نیست',
          );
        }
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          ...(amountRial ? { rialBalance: { increment: amountRial } } : {}),
          ...(amountGrams
            ? { goldBalanceGrams: { increment: amountGrams } }
            : {}),
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'MANUAL_ADJUSTMENT',
          status: 'COMPLETED',
          amountRial: amountRial || null,
          amountGrams: amountGrams || null,
          description: `تنظیم دستی موجودی توسط ادمین - ${description}`,
        },
      });

      if (amountRial) {
        const absRial = Math.abs(amountRial);
        await this.accountingService.postJournal(tx, {
          description: `تنظیم دستی موجودی ریالی - کاربر ${userId} - ${description}`,
          totalRial: absRial,
          totalGrams: 0,
          referenceType: 'WALLET_ADJUSTMENT',
          referenceId: transaction.id,
          createdByAdminId: adminUserId,
          transactionId: transaction.id,
          lines:
            amountRial > 0
              ? [
                  { accountCode: '1010', side: 'DEBIT', amountRial: absRial },
                  { accountCode: '2010', side: 'CREDIT', amountRial: absRial },
                ]
              : [
                  { accountCode: '2010', side: 'DEBIT', amountRial: absRial },
                  { accountCode: '1010', side: 'CREDIT', amountRial: absRial },
                ],
        });
      }

      if (amountGrams) {
        const absGrams = Math.abs(amountGrams);
        await this.accountingService.postJournal(tx, {
          description: `تنظیم دستی موجودی طلا - کاربر ${userId} - ${description}`,
          totalRial: 0,
          totalGrams: absGrams,
          referenceType: 'WALLET_ADJUSTMENT',
          referenceId: transaction.id,
          createdByAdminId: adminUserId,
          transactionId: transaction.id,
          lines:
            amountGrams > 0
              ? [
                  { accountCode: '1020', side: 'DEBIT', amountGrams: absGrams },
                  {
                    accountCode: '2020',
                    side: 'CREDIT',
                    amountGrams: absGrams,
                  },
                ]
              : [
                  { accountCode: '2020', side: 'DEBIT', amountGrams: absGrams },
                  {
                    accountCode: '1020',
                    side: 'CREDIT',
                    amountGrams: absGrams,
                  },
                ],
        });
      }

      return {
        message: 'موجودی کیف پول با موفقیت تنظیم شد',
        transactionId: transaction.id,
        adminUserId,
      };
    });
  }
}
