import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../config/system-config.service';
import { WalletService } from '../wallet/wallet.service';
import { AccountingService } from '../wallet/accounting.service';

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);

  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
    private walletService: WalletService,
    private accounting: AccountingService,
  ) {}

  // ── درخواست برداشت ──
  async requestWithdrawal(
    userId: string,
    amountRial: number,
    bankAccountId: string,
  ) {
    const limits = this.systemConfig.getLimits();

    // چک احراز هویت
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true, limits: true, wallet: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException('برای برداشت باید احراز هویت کنید');
    }

    // چک حداقل برداشت
    if (amountRial < limits.withdrawMin) {
      throw new BadRequestException(
        `حداقل مبلغ برداشت ${limits.withdrawMin.toLocaleString('fa-IR')} تومان است`,
      );
    }

    // چک سقف ماهانه کاربر
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyWithdrawn = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: 'WITHDRAWAL',
        status: 'COMPLETED',
        createdAt: { gte: startOfMonth },
      },
      _sum: { amountRial: true },
    });

    const monthlyUsed = Number(monthlyWithdrawn._sum.amountRial ?? 0);
    const monthlyLimit = user.limits
      ? Number(user.limits.monthlyWithdrawLimitRial)
      : limits.withdrawMaxDaily;

    if (monthlyUsed + amountRial > monthlyLimit) {
      const remaining = monthlyLimit - monthlyUsed;
      throw new BadRequestException(
        `سقف برداشت ماهانه شما ${monthlyLimit.toLocaleString('fa-IR')} تومان است. باقی‌مانده: ${remaining.toLocaleString('fa-IR')} تومان`,
      );
    }

    // چک حساب بانکی
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId, isVerified: true },
    });
    if (!bankAccount) {
      throw new BadRequestException(
        'حساب بانکی تایید‌شده یافت نشد. لطفاً ابتدا حساب بانکی خود را تایید کنید',
      );
    }

    if (!user.wallet) throw new NotFoundException('کیف پول یافت نشد');

    // تعیین نیاز به تایید چندمرحله‌ای
    const needsTwoApprovals = amountRial >= limits.withdrawApprovalThreshold;

    return this.prisma.$transaction(async (tx) => {
      // ساخت درخواست برداشت
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          userId,
          bankAccountId,
          amountRial: amountRial,

          status: 'PENDING',
        },
      });

      // مسدود کردن موجودی
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48);

      await tx.walletHold.create({
        data: {
          walletId: user.wallet.id,
          holdType: 'WITHDRAWAL',
          referenceId: withdrawal.id,
          amountRial: amountRial,
          expiresAt,
        },
      });

      // ساخت Approval record(s)
      await tx.approval.create({
        data: {
          requestType: 'WITHDRAWAL',
          requestId: withdrawal.id,
          approverId: userId, // placeholder — ادمین بعداً پر میکنه
          step: 1,
          status: 'APPROVED', // pending در واقع — ادمین تغییر میده
          withdrawalRequestId: withdrawal.id,
        },
      });

      if (needsTwoApprovals) {
        await tx.approval.create({
          data: {
            requestType: 'WITHDRAWAL',
            requestId: withdrawal.id,
            approverId: userId,
            step: 2,
            status: 'APPROVED',
            withdrawalRequestId: withdrawal.id,
          },
        });
      }

      return {
        withdrawalId: withdrawal.id,
        amountRial,
        status: 'PENDING',
        needsTwoApprovals,
        message: needsTwoApprovals
          ? `درخواست برداشت ثبت شد. این مبلغ نیاز به تایید دو کارشناس دارد`
          : `درخواست برداشت ثبت شد و در انتظار تایید کارشناس است`,
        estimatedTime: 'معمولاً ۱ تا ۲ روز کاری',
      };
    });
  }

  // ── لغو درخواست برداشت (فقط PENDING) ──
  async cancelWithdrawal(userId: string, withdrawalId: string) {
    const withdrawal = await this.prisma.withdrawalRequest.findFirst({
      where: { id: withdrawalId, userId, status: 'PENDING' },
    });
    if (!withdrawal) {
      throw new NotFoundException('درخواست برداشت یافت نشد یا قابل لغو نیست');
    }

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    await this.prisma.$transaction([
      // آزاد کردن hold
      this.prisma.walletHold.deleteMany({
        where: { referenceId: withdrawalId, holdType: 'WITHDRAWAL' },
      }),
      // تغییر وضعیت
      this.prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { status: 'REJECTED', adminNotes: 'لغو توسط کاربر' },
      }),
    ]);

    return { message: 'درخواست برداشت لغو شد و موجودی آزاد شد' };
  }

  // ── لیست درخواست‌های برداشت کاربر ──
  async getWithdrawals(userId: string, page = 1, limit = 10) {
    const [total, items] = await Promise.all([
      this.prisma.withdrawalRequest.count({ where: { userId } }),
      this.prisma.withdrawalRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          bankAccount: {
            select: { bankName: true, cardNumber: true },
          },
        },
      }),
    ]);

    return {
      data: items.map((w) => ({
        id: w.id,
        amountRial: Number(w.amountRial),
        amountRialFormatted: Number(w.amountRial).toLocaleString('fa-IR'),
        status: w.status,
        statusLabel: this.getStatusLabel(w.status),
        bankName: w.bankAccount.bankName,
        cardLast4: w.bankAccount.cardNumber.slice(-4),
        adminNotes: w.adminNotes,
        createdAt: w.createdAt,
        canCancel: w.status === 'PENDING',
      })),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  private getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'در انتظار بررسی',
      APPROVED: 'تایید شده',
      REJECTED: 'رد شده',
      PROCESSED: 'پرداخت شده',
    };
    return labels[status] ?? status;
  }
}
