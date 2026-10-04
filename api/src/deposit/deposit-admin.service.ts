// api/src/deposit/deposit-admin.service.ts

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { AccountingService } from '../accounting/accounting.service';
import {
  assertTransition,
  MAX_REJECTIONS,
  STATUS_LABEL,
} from './deposit.state';
import type { DepositStatusValue } from './deposit.state';
import { formatJalaliDateTime } from '../common/utils/jalali.util';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { SystemConfigService } from '../system-config/system-config.service';

@Injectable()
export class DepositAdminService {
  private readonly logger = new Logger(DepositAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly accountingService: AccountingService,
    private readonly smsTemplates: SmsTemplateService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  /** حساب بانک دریافت‌کننده‌ی واریز: 1010 یا معین فعال زیر آن */
  private async resolveCashAccount(
    tx: Prisma.TransactionClient,
    code?: string,
  ): Promise<string> {
    const fallback = await this.systemConfig.get(
      'deposit.default_cash_account',
      '1010',
    );
    const chosen = (code?.trim() || fallback || '1010').trim();
    if (!/^1010\d*$/.test(chosen)) {
      throw new BadRequestException(
        'حساب دریافت باید حساب نقد و بانک (1010 یا معین‌های آن) باشد',
      );
    }
    const account = await tx.account.findUnique({ where: { code: chosen } });
    if (!account || !account.isActive) {
      throw new BadRequestException(`حساب ${chosen} یافت نشد یا غیرفعال است`);
    }
    return chosen;
  }

  private notify(
    d: {
      id: string;
      userId: string;
      requestNumber: string;
      amountRial: Prisma.Decimal;
    },
    key: 'DEPOSIT_APPROVED' | 'DEPOSIT_REJECTED',
    reason?: string,
  ) {
    void this.smsTemplates
      .sendToUser(
        key,
        d.userId,
        {
          amount: Math.round(Number(d.amountRial) / 10).toLocaleString('fa-IR'),
          requestNumber: d.requestNumber,
          reason: reason ?? '',
        },
        { referenceType: 'DEPOSIT', referenceId: d.id },
      )
      .catch(() => undefined);
  }

  // ═══════════════════════════════════════════════════════════
  // ── فهرست و جزئیات ──
  // ═══════════════════════════════════════════════════════════

  async list(query: {
    status?: DepositStatusValue;
    q?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 25));

    const where: Prisma.DepositRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { depositTrackingId: { contains: query.q } },
              { requestNumber: { contains: query.q, mode: 'insensitive' } },
              { user: { phone: { contains: query.q } } },
              {
                proformaInvoice: {
                  invoiceNumber: { contains: query.q, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [total, rows, counts] = await Promise.all([
      this.prisma.depositRequest.count({ where }),
      this.prisma.depositRequest.findMany({
        where,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              type: true,
              identity: {
                select: { firstName: true, lastName: true, nationalCode: true },
              },
              legalProfile: { select: { companyName: true } },
            },
          },
          _count: { select: { receipts: true } },
        },
      }),
      this.prisma.depositRequest.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      page,
      limit,
      statusCounts: Object.fromEntries(
        counts.map((c) => [c.status, c._count._all]),
      ),
      items: rows.map((r) => ({
        id: r.id,
        requestNumber: r.requestNumber,
        amountRial: r.amountRial.toString(),
        status: r.status,
        statusLabel: STATUS_LABEL[r.status],
        depositTrackingId: r.depositTrackingId,
        receiptCount: r._count.receipts,
        createdAt: r.createdAt.toISOString(),
        createdAtJalali: formatJalaliDateTime(r.createdAt),
        user: {
          id: r.user.id,
          phone: r.user.phone,
          displayName:
            r.user.legalProfile?.companyName ??
            `${r.user.identity?.firstName ?? ''} ${r.user.identity?.lastName ?? ''}`.trim(),
          nationalCode: r.user.identity?.nationalCode ?? null,
        },
      })),
    };
  }

  async getOne(depositId: string) {
    const d = await this.prisma.depositRequest.findUnique({
      where: { id: depositId },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            type: true,
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
            legalProfile: { select: { companyName: true, nationalId: true } },
          },
        },
        receipts: { orderBy: { uploadedAt: 'desc' } },
        proformaInvoice: {
          select: { id: true, invoiceNumber: true, status: true },
        },
        transaction: { select: { id: true, status: true, createdAt: true } },
      },
    });
    if (!d) throw new NotFoundException('درخواست واریز یافت نشد');

    // سابقه کاربر — سیگنال ریسک برای تصمیم ادمین
    const [approvedCount, rejectedCount, duplicateHashes] = await Promise.all([
      this.prisma.depositRequest.count({
        where: { userId: d.userId, status: 'APPROVED' },
      }),
      this.prisma.depositRequest.count({
        where: { userId: d.userId, status: 'REJECTED' },
      }),
      this.prisma.depositReceipt.findMany({
        where: {
          checksumSha256: { in: d.receipts.map((r) => r.checksumSha256) },
          depositRequestId: { not: depositId },
        },
        select: { depositRequestId: true, checksumSha256: true },
      }),
    ]);

    return {
      id: d.id,
      requestNumber: d.requestNumber,
      amountRial: d.amountRial.toString(),
      method: d.method,
      status: d.status,
      statusLabel: STATUS_LABEL[d.status],
      depositTrackingId: d.depositTrackingId,
      destination: d.destinationSnapshot,
      proformaInvoiceId: d.proformaInvoice?.id ?? null,
      proformaInvoiceNumber: d.proformaInvoice?.invoiceNumber ?? null,
      transactionId: d.transaction?.id ?? null,
      rejectionReason: d.rejectionReason,
      rejectionCount: d.rejectionCount,
      adminNotes: d.adminNotes,
      createdAtJalali: formatJalaliDateTime(d.createdAt),
      expiresAtJalali: formatJalaliDateTime(d.expiresAt),
      reviewStartedAtJalali: d.reviewStartedAt
        ? formatJalaliDateTime(d.reviewStartedAt)
        : null,
      reviewedAtJalali: d.reviewedAt
        ? formatJalaliDateTime(d.reviewedAt)
        : null,
      user: {
        id: d.user.id,
        phone: d.user.phone,
        type: d.user.type,
        status: d.user.status,
        displayName:
          d.user.legalProfile?.companyName ??
          `${d.user.identity?.firstName ?? ''} ${d.user.identity?.lastName ?? ''}`.trim(),
        nationalCode:
          d.user.identity?.nationalCode ??
          d.user.legalProfile?.nationalId ??
          null,
        identityStatus: d.user.identity?.status ?? null,
        memberSinceJalali: formatJalaliDateTime(d.user.createdAt),
      },
      riskSignals: {
        previousApproved: approvedCount,
        previousRejected: rejectedCount,
        duplicateReceiptDetected: duplicateHashes.length > 0,
        duplicateOf: duplicateHashes.map((x) => x.depositRequestId),
      },
      receipts: d.receipts.map((r) => ({
        id: r.id,
        fileName: r.fileName,
        fileSize: r.fileSize,
        mimeType: r.mimeType,
        userNote: r.userNote,
        checksumPrefix: r.checksumSha256.slice(0, 12),
        uploadedAtJalali: formatJalaliDateTime(r.uploadedAt),
      })),
    };
  }

  /** گزارش دوره‌ای واریزها: وضعیت‌ها، روش واریز، جمع روزانه‌ی تأییدشده و زمان بررسی */
  async report(from?: string, to?: string) {
    const range =
      from || to
        ? {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to
              ? { lt: new Date(new Date(to).getTime() + 86_400_000) }
              : {}),
          }
        : undefined;
    const [byStatus, approved, queue] = await Promise.all([
      this.prisma.depositRequest.groupBy({
        by: ['status'],
        where: range ? { createdAt: range } : {},
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
      this.prisma.depositRequest.findMany({
        where: { status: 'APPROVED', ...(range ? { reviewedAt: range } : {}) },
        select: {
          amountRial: true,
          method: true,
          reviewedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.depositRequest.aggregate({
        where: { status: { in: ['RECEIPT_UPLOADED', 'UNDER_REVIEW'] } },
        _count: { _all: true },
        _sum: { amountRial: true },
      }),
    ]);
    const byMethod = new Map<string, { count: number; amountRial: number }>();
    const daily = new Map<string, { count: number; amountRial: number }>();
    let reviewMs = 0;
    for (const d of approved) {
      const amount = Number(d.amountRial);
      const m = byMethod.get(d.method) ?? { count: 0, amountRial: 0 };
      m.count += 1;
      m.amountRial += amount;
      byMethod.set(d.method, m);
      if (d.reviewedAt) {
        const day = d.reviewedAt.toISOString().slice(0, 10);
        const x = daily.get(day) ?? { count: 0, amountRial: 0 };
        x.count += 1;
        x.amountRial += amount;
        daily.set(day, x);
        reviewMs += d.reviewedAt.getTime() - d.createdAt.getTime();
      }
    }
    return {
      byStatus: byStatus.map((s) => ({
        status: s.status,
        label: STATUS_LABEL[s.status],
        count: s._count._all,
        amountRial: (s._sum.amountRial ?? 0).toString(),
      })),
      byMethod: [...byMethod.entries()].map(([method, v]) => ({
        method,
        count: v.count,
        amountRial: String(v.amountRial),
      })),
      daily: [...daily.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, v]) => ({
          day,
          count: v.count,
          amountRial: String(v.amountRial),
        })),
      averageReviewHours: approved.length
        ? Math.round((reviewMs / approved.length / 3_600_000) * 10) / 10
        : null,
      openQueue: {
        count: queue._count._all,
        amountRial: (queue._sum.amountRial ?? 0).toString(),
      },
    };
  }

  /** هر بار صدور URL رسید در Audit ثبت می‌شود (دکوریتور روی کنترلر). */
  async getReceiptUrl(depositId: string, receiptId: string) {
    const receipt = await this.prisma.depositReceipt.findFirst({
      where: { id: receiptId, depositRequestId: depositId },
    });
    if (!receipt) throw new NotFoundException('رسید یافت نشد');

    return {
      url: await this.storage.getSignedReadUrl(receipt.storageKey, 120),
      expiresInSeconds: 120,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ── شروع بررسی ──
  // ═══════════════════════════════════════════════════════════

  async startReview(adminUserId: string, depositId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;
      const d = await tx.depositRequest.findUnique({
        where: { id: depositId },
      });
      if (!d) throw new NotFoundException('درخواست واریز یافت نشد');

      if (d.status === 'UNDER_REVIEW') {
        return {
          message: 'این درخواست در حال بررسی است',
          alreadyProcessed: true,
        };
      }
      assertTransition(d.status, 'UNDER_REVIEW');

      await tx.depositRequest.update({
        where: { id: depositId },
        data: {
          status: 'UNDER_REVIEW',
          reviewStartedAt: new Date(),
          reviewedById: adminUserId,
        },
      });

      return { message: 'بررسی آغاز شد', alreadyProcessed: false };
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ── تایید — هسته مالی ──
  // ═══════════════════════════════════════════════════════════

  /**
   * دفاع لایه‌ای در برابر Double Credit:
   *   ۱. pg_advisory_xact_lock — قفل توزیع‌شده روی همین درخواست.
   *      برخلاف قفل Redis، خودکار در پایان تراکنش آزاد می‌شود و
   *      هیچ وابستگی خارجی ندارد.
   *   ۲. SELECT ... FOR UPDATE با ترتیب ثابت: deposit_requests سپس wallets
   *   ۳. بازخوانی وضعیت داخل تراکنش
   *   ۴. قید یکتای deposit_requests.transaction_id در دیتابیس
   *
   * ⚠ هیچ عدد مالی از بدنه درخواست خوانده نمی‌شود؛ مبلغ فقط از رکورد DB.
   */
  async approve(
    adminUserId: string,
    depositId: string,
    note?: string,
    cashAccountCode?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      // لایه ۱ — قفل مشورتی روی UUID درخواست
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'deposit:' + depositId}))`;

      // لایه ۲ — ترتیب ثابت قفل‌گیری
      await tx.$executeRaw`SELECT 1 FROM "deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;

      const d = await tx.depositRequest.findUnique({
        where: { id: depositId },
      });
      if (!d) throw new NotFoundException('درخواست واریز یافت نشد');

      // لایه ۳ — پاسخ idempotent به‌جای خطا
      if (d.status === 'APPROVED') {
        return {
          message: 'این درخواست قبلاً تایید شده است',
          alreadyProcessed: true,
          transactionId: d.transactionId,
        };
      }
      assertTransition(d.status, 'APPROVED');

      const receiptCount = await tx.depositReceipt.count({
        where: { depositRequestId: depositId },
      });
      if (receiptCount === 0) {
        throw new BadRequestException(
          'بدون رسید واریز، تایید درخواست ممکن نیست',
        );
      }

      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${d.walletId}::uuid FOR UPDATE`;
      const wallet = await tx.wallet.findUnique({ where: { id: d.walletId } });
      if (!wallet) throw new NotFoundException('کیف پول کاربر یافت نشد');

      const amountRial = Number(d.amountRial);
      const cashCode = await this.resolveCashAccount(tx, cashAccountCode);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { rialBalance: { increment: amountRial } },
      });

      const transaction = await tx.transaction.create({
        data: {
          userId: d.userId,
          walletId: wallet.id,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          amountRial,
          description: `واریز بانکی تاییدشده — درخواست ${d.requestNumber} — شناسه واریز ${d.depositTrackingId}`,
        },
      });

      // سند دوطرفه — تنها نقطه مجاز ثبت سند در سیستم
      await this.accountingService.postJournal(tx, {
        description: `واریز بانکی کاربر — ${d.requestNumber} — شناسه واریز ${d.depositTrackingId}`,
        totalRial: amountRial,
        totalGrams: 0,
        lines: [
          { accountCode: cashCode, side: 'DEBIT', amountRial }, // بانک دریافت‌کننده
          { accountCode: '2010', side: 'CREDIT', amountRial }, // بدهی به مشتری
        ],
        referenceType: 'DEPOSIT',
        referenceId: d.id,
        createdByAdminId: adminUserId,
        transactionId: transaction.id,
      });

      // لایه ۴ — اگر رکورد دیگری همزمان transactionId گرفته باشد،
      // قید unique اینجا P2002 می‌دهد و کل تراکنش rollback می‌شود
      await tx.depositRequest.update({
        where: { id: depositId },
        data: {
          status: 'APPROVED',
          transactionId: transaction.id,
          reviewedById: adminUserId,
          reviewedAt: new Date(),
          adminNotes: note?.trim()?.slice(0, 500) ?? d.adminNotes,
        },
      });

      if (d.proformaInvoiceId) {
        await tx.invoice.update({
          where: { id: d.proformaInvoiceId },
          data: { status: 'CONSUMED' },
        });
      }

      return {
        message: 'درخواست واریز تایید و کیف پول شارژ شد',
        alreadyProcessed: false,
        transactionId: transaction.id,
        deposit: d,
      };
    });

    if (!result.alreadyProcessed && 'deposit' in result && result.deposit) {
      this.logger.log(
        `[Deposit] تایید شد — درخواست ${depositId} توسط ادمین ${adminUserId}`,
      );
      this.notify(result.deposit, 'DEPOSIT_APPROVED');
    }
    return {
      message: result.message,
      alreadyProcessed: result.alreadyProcessed,
      transactionId: result.transactionId,
    };
  }

  // ═══════════════════════════════════════════════════════════
  // ── رد ──
  // ═══════════════════════════════════════════════════════════

  async reject(adminUserId: string, depositId: string, reason: string) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('دلیل رد باید حداقل ۱۰ کاراکتر باشد');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'deposit:' + depositId}))`;
      await tx.$executeRaw`SELECT 1 FROM "deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;

      const d = await tx.depositRequest.findUnique({
        where: { id: depositId },
      });
      if (!d) throw new NotFoundException('درخواست واریز یافت نشد');

      if (d.status === 'REJECTED') {
        return {
          message: 'این درخواست قبلاً رد شده است',
          alreadyProcessed: true,
        };
      }
      assertTransition(d.status, 'REJECTED');

      const nextCount = d.rejectionCount + 1;

      await tx.depositRequest.update({
        where: { id: depositId },
        data: {
          status: 'REJECTED',
          rejectionReason: reason.trim(),
          rejectionCount: nextCount,
          reviewedById: adminUserId,
          reviewedAt: new Date(),
        },
      });

      // بعد از سومین رد، پیش‌فاکتور هم باطل می‌شود
      if (nextCount >= MAX_REJECTIONS && d.proformaInvoiceId) {
        await tx.invoice.update({
          where: { id: d.proformaInvoiceId },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: 'رد مکرر درخواست واریز',
          },
        });
      }

      return {
        message: 'درخواست واریز رد شد',
        alreadyProcessed: false,
        remainingAttempts: Math.max(0, MAX_REJECTIONS - nextCount),
        deposit: d,
      };
    });
    if (!result.alreadyProcessed && 'deposit' in result && result.deposit) {
      this.notify(result.deposit, 'DEPOSIT_REJECTED', reason.trim());
    }
    return {
      message: result.message,
      alreadyProcessed: result.alreadyProcessed,
      ...('remainingAttempts' in result
        ? { remainingAttempts: result.remainingAttempts }
        : {}),
    };
  }

  /** برگرداندن به مرحله ارسال رسید — وقتی تصویر ناخوانا است. */
  async requestNewReceipt(
    adminUserId: string,
    depositId: string,
    note: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "deposit_requests" WHERE "id" = ${depositId}::uuid FOR UPDATE`;
      const d = await tx.depositRequest.findUnique({
        where: { id: depositId },
      });
      if (!d) throw new NotFoundException('درخواست واریز یافت نشد');

      assertTransition(d.status, 'RECEIPT_UPLOADED');

      await tx.depositRequest.update({
        where: { id: depositId },
        data: {
          status: 'RECEIPT_UPLOADED',
          adminNotes: note?.trim()?.slice(0, 500) ?? null,
          reviewedById: adminUserId,
        },
      });

      return {
        message: 'درخواست ارسال رسید جدید ثبت شد',
        alreadyProcessed: false,
      };
    });
  }
}
