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

@Injectable()
export class DepositAdminService {
  private readonly logger = new Logger(DepositAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly accountingService: AccountingService,
  ) {}

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
  async approve(adminUserId: string, depositId: string, note?: string) {
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
        description: `واریز بانکی کاربر ${d.userId} — ${d.requestNumber}`,
        totalRial: amountRial,
        totalGrams: 0,
        lines: [
          { accountCode: '1010', side: 'DEBIT', amountRial }, // بانک / نقد
          { accountCode: '2010', side: 'CREDIT', amountRial }, // بدهی به مشتری
        ],
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
      };
    });

    if (!result.alreadyProcessed) {
      this.logger.log(
        `[Deposit] تایید شد — درخواست ${depositId} توسط ادمین ${adminUserId}`,
      );
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // ── رد ──
  // ═══════════════════════════════════════════════════════════

  async reject(adminUserId: string, depositId: string, reason: string) {
    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException('دلیل رد باید حداقل ۱۰ کاراکتر باشد');
    }

    return this.prisma.$transaction(async (tx) => {
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
      };
    });
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
