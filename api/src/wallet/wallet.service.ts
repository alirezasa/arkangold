import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../config/system-config.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
  ) {}

  // ── موجودی کیف پول ──
  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        holds: {
          where: { expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    const holdsRial = wallet.holds
      .filter((h) => h.amountRial)
      .reduce((s, h) => s + Number(h.amountRial), 0);
    const holdsGrams = wallet.holds
      .filter((h) => h.amountGrams)
      .reduce((s, h) => s + Number(h.amountGrams), 0);

    return {
      cardNumber: wallet.cardNumber,
      goldBalanceGrams: Number(wallet.goldBalanceGrams),
      rialBalance: Number(wallet.rialBalance),
      frozenRial: holdsRial,
      frozenGrams: holdsGrams,
      availableRial: Number(wallet.rialBalance) - holdsRial,
      availableGrams: Number(wallet.goldBalanceGrams) - holdsGrams,
      holds: wallet.holds.map((h) => ({
        id: h.id,
        type: h.holdType,
        amountRial: h.amountRial ? Number(h.amountRial) : null,
        amountGrams: h.amountGrams ? Number(h.amountGrams) : null,
        expiresAt: h.expiresAt,
      })),
    };
  }

  // ── تاریخچه تراکنش‌ها ──
  // ── تاریخچه تراکنش‌ها ──
  // ── تاریخچه تراکنش‌ها ──
  async getTransactions(userId: string, page = 1, limit = 20, type?: string) {
    // دریافت تایپ استاندارد از متد پریسما
    type TargetWhere = Parameters<
      typeof this.prisma.transaction.findMany
    >[0]['where'];

    const where: TargetWhere = { userId };

    // تزریق فیلد type بدون ایجاد خطای تایپ و ESLint
    if (type !== undefined) {
      Object.assign(where, { type });
    }

    const [total, items] = await Promise.all([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          type: true,
          amountGrams: true,
          amountRial: true,
          pricePerGram: true,
          feeAmount: true,
          taxAmount: true,
          status: true,
          description: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: items.map((t) => ({
        ...t,
        amountGrams: t.amountGrams ? Number(t.amountGrams) : null,
        amountRial: t.amountRial ? Number(t.amountRial) : null,
        pricePerGram: t.pricePerGram ? Number(t.pricePerGram) : null,
        feeAmount: t.feeAmount ? Number(t.feeAmount) : null,
        taxAmount: t.taxAmount ? Number(t.taxAmount) : null,
      })),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ── سقف‌ها و راهنما (dynamic از DB) ──
  async getLimitsGuide(userId: string) {
    const limits = this.systemConfig.getLimits();

    const userLimit = await this.prisma.userLimit.findUnique({
      where: { userId },
    });

    // مصرف ماهانه برداشت
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
    const monthlyLimit = userLimit
      ? Number(userLimit.monthlyWithdrawLimitRial)
      : limits.withdrawMaxDaily;
    const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

    return {
      deposit: {
        gateway: {
          min: limits.depositGatewayMin,
          max: limits.depositGatewayMax,
          minFormatted: limits.depositGatewayMin.toLocaleString('fa-IR'),
          maxFormatted: limits.depositGatewayMax.toLocaleString('fa-IR'),
          description: 'واریز اینترنتی از طریق درگاه پرداخت',
          notes: [
            'پرداخت باید از کارت بانکی به نام خودتان باشد',
            'در غیر این صورت مبلغ تا ۳ روز کاری برگشت داده می‌شود',
          ],
        },
        sheba: {
          min: limits.depositShebaMin,
          minFormatted: limits.depositShebaMin.toLocaleString('fa-IR'),
          description: 'واریز مستقیم با شماره شبا — مناسب مبالغ بالا',
          platformSheba: limits.platformSheba,
          platformBank: limits.platformBankName,
          notes: [
            'شارژ از طریق پایا انجام می‌شود و تا یک روز کاری زمانبر است',
            'واریز باید با کارتی باشد که قبلاً در پنل ثبت کرده‌اید',
            'در بخش «بابت»، گزینه امور سرمایه‌گذاری و بورس را انتخاب کنید',
            'واریز با کارت هدیه، بن‌کارت یا کارت فاقد شبا ممنوع است',
            'سقف واریز بسته به محدودیت بانک شماست؛ پلتفرم محدودیتی ندارد',
          ],
          warning: 'در صورت اختلال بانکی، پلتفرم مسئولیتی در قبال تأخیر ندارد',
        },
      },
      withdrawal: {
        min: limits.withdrawMin,
        minFormatted: limits.withdrawMin.toLocaleString('fa-IR'),
        monthlyLimit,
        monthlyLimitFormatted: monthlyLimit.toLocaleString('fa-IR'),
        monthlyUsed,
        monthlyUsedFormatted: monthlyUsed.toLocaleString('fa-IR'),
        monthlyRemaining,
        monthlyRemainingFormatted: monthlyRemaining.toLocaleString('fa-IR'),
        approvalThreshold: limits.withdrawApprovalThreshold,
        approvalThresholdFormatted:
          limits.withdrawApprovalThreshold.toLocaleString('fa-IR'),
        notes: [
          `حداقل مبلغ برداشت ${limits.withdrawMin.toLocaleString('fa-IR')} تومان است`,
          'برداشت از طریق سیستم پایا انجام می‌شود',
          `مبالغ بالای ${limits.withdrawApprovalThreshold.toLocaleString('fa-IR')} تومان نیاز به تایید دو کارشناس دارد`,
          'درخواست‌های در انتظار قابل لغو هستند',
        ],
      },
    };
  }

  // ── اطلاعات واریز شبا ──
  async getShebaDepositInfo(userId: string) {
    const limits = this.systemConfig.getLimits();

    // چک کارت ثبت‌شده
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { userId, isVerified: true },
      orderBy: { isDefault: 'desc' },
    });

    return {
      platformSheba: limits.platformSheba,
      platformBankName: limits.platformBankName,
      userHasVerifiedCard: !!bankAccount,
      userCard: bankAccount
        ? {
            bankName: bankAccount.bankName,
            cardLast4: bankAccount.cardNumber.slice(-4),
          }
        : null,
      instructions: [
        {
          step: 1,
          text: 'مطمئن شوید کارت بانکی تایید‌شده در پنل ثبت کرده‌اید',
        },
        { step: 2, text: `مبلغ مورد نظر را به شبای پلتفرم واریز کنید` },
        {
          step: 3,
          text: 'در بخش «بابت» گزینه «امور سرمایه‌گذاری و بورس» را انتخاب کنید',
        },
        {
          step: 4,
          text: 'پس از پردازش پایا (تا یک روز کاری) موجودی شما شارژ می‌شود',
        },
      ],
      warnings: [
        'واریز با کارت هدیه، بن‌کارت یا کارت فاقد شبا ممنوع است',
        'واریز باید از حساب بانکی به نام خودتان باشد',
        'در صورت اختلال بانکی، پلتفرم مسئولیتی در قبال تأخیر ندارد',
      ],
    };
  }

  // ── واریز درگاه (callback از درگاه پرداخت) ──
  async confirmGatewayDeposit(
    userId: string,
    amountRial: number,
    referenceCode: string,
  ) {
    const limits = this.systemConfig.getLimits();

    if (amountRial < limits.depositGatewayMin) {
      throw new BadRequestException(
        `حداقل واریز ${limits.depositGatewayMin.toLocaleString('fa-IR')} تومان است`,
      );
    }
    if (amountRial > limits.depositGatewayMax) {
      throw new BadRequestException(
        `سقف واریز درگاه ${limits.depositGatewayMax.toLocaleString('fa-IR')} تومان است`,
      );
    }

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    return this.prisma.$transaction(async (tx) => {
      // ثبت تراکنش
      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'DEPOSIT',
          amountRial,
          status: 'COMPLETED',
          description: `واریز درگاه - کد پیگیری: ${referenceCode}`,
        },
      });

      // بروزرسانی موجودی
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          rialBalance: {
            increment: amountRial,
          },
        },
      });

      return { transaction, message: 'موجودی با موفقیت شارژ شد' };
    });
  }

  // ── مسدود کردن موجودی ──
  async createHold(
    walletId: string,
    type: 'ORDER' | 'WITHDRAWAL' | 'PHYSICAL_DELIVERY',
    referenceId: string,
    amountRial?: number,
    amountGrams?: number,
    expiresInHours = 24,
  ) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        holds: { where: { expiresAt: { gt: new Date() } } },
      },
    });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    // چک موجودی آزاد
    if (amountRial) {
      const frozenRial = wallet.holds.reduce(
        (s, h) => s + Number(h.amountRial ?? 0),
        0,
      );
      const available = Number(wallet.rialBalance) - frozenRial;
      if (amountRial > available) {
        throw new BadRequestException(
          `موجودی کافی نیست. موجودی آزاد: ${available.toLocaleString('fa-IR')} تومان`,
        );
      }
    }

    if (amountGrams) {
      const frozenGrams = wallet.holds.reduce(
        (s, h) => s + Number(h.amountGrams ?? 0),
        0,
      );
      const available = Number(wallet.goldBalanceGrams) - frozenGrams;
      if (amountGrams > available) {
        throw new BadRequestException(
          `موجودی طلای کافی نیست. موجودی آزاد: ${available} گرم`,
        );
      }
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + expiresInHours);

    return this.prisma.walletHold.create({
      data: {
        walletId,
        holdType: type,
        referenceId,
        amountRial: amountRial ?? null,
        amountGrams: amountGrams ?? null,
        expiresAt,
      },
    });
  }

  // ── آزاد کردن hold ──
  async releaseHold(holdId: string) {
    const hold = await this.prisma.walletHold.findUnique({
      where: { id: holdId },
    });
    if (!hold) throw new NotFoundException('hold یافت نشد');
    await this.prisma.walletHold.delete({ where: { id: holdId } });
    return { message: 'موجودی آزاد شد' };
  }

  // ── cron: پاک‌کردن hold های منقضی هر ۱۵ دقیقه ──
  @Cron('0 */15 * * * *')
  async expireHolds() {
    const expired = await this.prisma.walletHold.findMany({
      where: { expiresAt: { lt: new Date() } },
      include: { wallet: true },
    });

    for (const hold of expired) {
      await this.prisma.walletHold.delete({ where: { id: hold.id } });
      this.logger.log(`[WalletHold] منقضی و حذف شد: ${hold.id}`);
    }

    if (expired.length > 0) {
      this.logger.log(`[WalletHold] ${expired.length} hold منقضی پاک شد`);
    }
  }
}
