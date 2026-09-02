// api/src/wallet/wallet-admin.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { AccountingService } from '../accounting/accounting.service';

interface ListWithdrawalsQuery {
  page?: number;
  limit?: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
}

@Injectable()
export class WalletAdminService {
  constructor(
    private prisma: PrismaService,
    private accountingService: AccountingService,
  ) {}

  private toNumber(value: unknown): number {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) {
      throw new BadRequestException('مقدار عددی نامعتبر است');
    }

    return numberValue;
  }

  async list(query: ListWithdrawalsQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const where: Prisma.WithdrawalRequestWhereInput = query.status
      ? { status: query.status }
      : {};

    const [items, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where,
        include: {
          user: { select: { id: true, phone: true } },
          bankAccount: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.withdrawalRequest.count({ where }),
    ]);

    return {
      data: items.map((w) => ({
        id: w.id,
        amountToman: (Number(w.amountRial) / 10).toString(),
        status: w.status,
        adminNotes: w.adminNotes,
        user: w.user,
        bankAccount: {
          bankName: w.bankAccount.bankName,
          cardNumber: w.bankAccount.cardNumber,
        },
        createdAt: w.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  // ── تایید: کسر قطعی از موجودی + آزادسازی hold ──
  async approve(adminUserId: string, withdrawalId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "withdrawal_requests" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`;
      const withdrawal = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
      });
      if (!withdrawal) throw new NotFoundException('درخواست برداشت یافت نشد');

      if (
        withdrawal.status === 'APPROVED' ||
        withdrawal.status === 'PROCESSED'
      ) {
        return {
          message: 'این درخواست قبلاً تایید شده است',
          alreadyProcessed: true,
        };
      }
      if (withdrawal.status !== 'PENDING') {
        throw new ConflictException(
          'فقط درخواست‌های در انتظار قابل تایید هستند',
        );
      }

      const wallet = await tx.wallet.findUnique({
        where: { userId: withdrawal.userId },
      });
      if (!wallet) throw new NotFoundException('کیف پول کاربر یافت نشد');

      // پیدا کردن hold مرتبط از روی description تراکنش (طبق الگوی موجود در WalletService)
      const relatedTx = await tx.transaction.findFirst({
        where: {
          userId: withdrawal.userId,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          description: { contains: withdrawal.id },
        },
      });

      const walletRialBalance = this.toNumber(wallet.rialBalance);
      const withdrawalAmountRial = this.toNumber(withdrawal.amountRial);

      if (walletRialBalance < withdrawalAmountRial) {
        throw new BadRequestException('موجودی کاربر برای این برداشت کافی نیست');
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { rialBalance: { decrement: withdrawalAmountRial } },
      });

      // مشکل ESLint در این بخش با جایگزینی متغیر عددی و استفاده از 0 حل شده است
      await this.accountingService.postJournal(tx, {
        description: `تایید برداشت - درخواست ${withdrawal.id}`,
        totalRial: withdrawalAmountRial,
        totalGrams: 0,
        lines: [
          {
            accountCode: '2010',
            side: 'DEBIT',
            amountRial: withdrawalAmountRial,
          },
          {
            accountCode: '1010',
            side: 'CREDIT',
            amountRial: withdrawalAmountRial,
          },
        ],
      });

      // آزادسازی hold مرتبط (اگر پیدا شد)
      const holdIdMatch = relatedTx?.description?.match(/hold:([a-f0-9-]+)/);
      if (holdIdMatch) {
        await tx.walletHold
          .delete({ where: { id: holdIdMatch[1] } })
          .catch(() => {});
      }

      if (relatedTx) {
        await tx.transaction.update({
          where: { id: relatedTx.id },
          data: { status: 'COMPLETED' },
        });
      }

      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: { status: 'APPROVED', processedById: adminUserId },
      });

      await tx.approval.create({
        data: {
          requestType: 'WITHDRAWAL',
          requestId: withdrawal.id,
          withdrawalRequestId: withdrawal.id,
          approverId: adminUserId,
          status: 'APPROVED',
        },
      });

      return { message: 'درخواست برداشت تایید شد', alreadyProcessed: false };
    });
  }

  // ── رد: بازگشت موجودی به کاربر (چون هنوز از کیف پول کسر نشده بود، فقط hold آزاد می‌شود) ──
  async reject(adminUserId: string, withdrawalId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "withdrawal_requests" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`;
      const withdrawal = await tx.withdrawalRequest.findUnique({
        where: { id: withdrawalId },
      });
      if (!withdrawal) throw new NotFoundException('درخواست برداشت یافت نشد');

      if (withdrawal.status === 'REJECTED') {
        return {
          message: 'این درخواست قبلاً رد شده است',
          alreadyProcessed: true,
        };
      }
      if (withdrawal.status !== 'PENDING') {
        throw new ConflictException('فقط درخواست‌های در انتظار قابل رد هستند');
      }

      const relatedTx = await tx.transaction.findFirst({
        where: {
          userId: withdrawal.userId,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          description: { contains: withdrawal.id },
        },
      });

      const holdIdMatch = relatedTx?.description?.match(/hold:([a-f0-9-]+)/);
      if (holdIdMatch) {
        await tx.walletHold
          .delete({ where: { id: holdIdMatch[1] } })
          .catch(() => {});
      }

      if (relatedTx) {
        await tx.transaction.update({
          where: { id: relatedTx.id },
          data: { status: 'FAILED' },
        });
      }

      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: {
          status: 'REJECTED',
          adminNotes: reason,
          processedById: adminUserId,
        },
      });

      await tx.approval.create({
        data: {
          requestType: 'WITHDRAWAL',
          requestId: withdrawal.id,
          withdrawalRequestId: withdrawal.id,
          approverId: adminUserId,
          status: 'REJECTED',
          comment: reason,
        },
      });

      return { message: 'درخواست برداشت رد شد', alreadyProcessed: false };
    });
  }

  // ── شارژ/کسر دستی موجودی کیف پول توسط ادمین ──
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
          lines:
            amountGrams > 0
              ? [
                  { accountCode: '1020', side: 'DEBIT', amountGrams: absGrams },
                  { accountCode: '2020', side: 'CREDIT', amountGrams: absGrams },
                ]
              : [
                  { accountCode: '2020', side: 'DEBIT', amountGrams: absGrams },
                  { accountCode: '1020', side: 'CREDIT', amountGrams: absGrams },
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
