// api/src/wallet/wallet-admin.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

interface ListWithdrawalsQuery {
  page?: number;
  limit?: number;
  status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
}

@Injectable()
export class WalletAdminService {
  constructor(private prisma: PrismaService) {}

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
        amountToman: w.amountRial.dividedBy(10).toString(),
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

      if (wallet.rialBalance.lessThan(withdrawal.amountRial)) {
        throw new BadRequestException('موجودی کاربر برای این برداشت کافی نیست');
      }

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { rialBalance: { decrement: withdrawal.amountRial } },
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
}
