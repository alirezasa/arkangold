import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { Prisma } from '../generated/prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { DocumentSequenceService } from '../common/documents/document-sequence.service';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { DepositService } from '../deposit/deposit.service';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
    private accountingService: AccountingService,
    private documentSequence: DocumentSequenceService,
    private smsTemplates: SmsTemplateService,
    private deposits: DepositService,
  ) {}

  // ══════════════════════════════════════════
  // ── دریافت اطلاعات کیف پول کاربر ──
  // ══════════════════════════════════════════
  async getWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        holds: {
          where: { expiresAt: { gt: new Date() } },
        },
      },
    });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    // محاسبه موجودی در انتظار (hold)
    const holdRial = wallet.holds.reduce(
      (sum, h) => sum + (h.amountRial ? Number(h.amountRial) : 0),
      0,
    );
    const holdGrams = wallet.holds.reduce(
      (sum, h) => sum + (h.amountGrams ? Number(h.amountGrams) : 0),
      0,
    );

    // محاسبه واریز روزانه امروز
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyDeposit = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: 'DEPOSIT',
        status: 'COMPLETED',
        createdAt: { gte: today },
      },
      _sum: { amountRial: true },
    });

    // محاسبه برداشت ماهانه
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyWithdrawal = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: 'WITHDRAWAL',
        status: { in: ['PENDING', 'COMPLETED'] },
        createdAt: { gte: firstDayOfMonth },
      },
      _sum: { amountRial: true },
    });

    return {
      id: wallet.id,
      cardNumber: wallet.cardNumber,
      rialBalance: Number(wallet.rialBalance),
      goldBalanceGrams: Number(wallet.goldBalanceGrams),
      holdRial,
      holdGrams,
      availableRial: Number(wallet.rialBalance) - holdRial,
      availableGrams: Number(wallet.goldBalanceGrams) - holdGrams,
      stats: {
        todayDeposit: Number(dailyDeposit._sum.amountRial ?? 0),
        monthWithdrawal: Number(monthlyWithdrawal._sum.amountRial ?? 0),
      },
    };
  }

  // ══════════════════════════════════════════
  // ── دریافت config های واریز برای فرانت ──
  // ══════════════════════════════════════════
  async getDepositConfig() {
    const [
      onlineEnabled,
      onlineMin,
      onlineMax,
      onlineDailyLimit,
      c2cDailyLimit,
      c2cMin,
      c2cMax,
      c2cDestCard,
      c2cDestOwner,
      c2cTime,
      bankDestAccount,
      bankDestSheba,
      bankDestOwner,
      bankTime,
      trackingDailyLimit,
      trackingDestAccount,
      trackingDestSheba,
      trackingDestOwner,
      largeMin,
      largeDestAccount,
      largeDestSheba,
      directDailyLimit,
      directDestCard,
      c2cEnabled,
      bankEnabled,
      trackingEnabled,
      largeEnabled,
      directEnabled,
    ] = await Promise.all([
      this.systemConfig.getBoolean('deposit.online.enabled', false),
      this.systemConfig.getNumber('deposit.online.min_amount', 100000),
      this.systemConfig.getNumber('deposit.online.max_amount', 400000000),
      this.systemConfig.getNumber('deposit.online.daily_limit', 400000000),
      this.systemConfig.getNumber(
        'deposit.card_to_card.daily_limit',
        150000000,
      ),
      this.systemConfig.getNumber('deposit.card_to_card.min_amount', 100000),
      this.systemConfig.getNumber('deposit.card_to_card.max_amount', 150000000),
      this.systemConfig.get('deposit.card_to_card.destination_card'),
      this.systemConfig.get('deposit.card_to_card.destination_owner'),
      this.systemConfig.get(
        'deposit.card_to_card.processing_time',
        'کمتر از ۱۵ دقیقه',
      ),
      this.systemConfig.get('deposit.bank_transfer.destination_account'),
      this.systemConfig.get('deposit.bank_transfer.destination_sheba'),
      this.systemConfig.get('deposit.bank_transfer.destination_owner'),
      this.systemConfig.get(
        'deposit.bank_transfer.processing_time',
        'واریز در سیکل پایا',
      ),
      this.systemConfig.getNumber(
        'deposit.tracking_id.daily_limit',
        4000000000,
      ),
      this.systemConfig.get('deposit.tracking_id.destination_account'),
      this.systemConfig.get('deposit.tracking_id.destination_sheba'),
      this.systemConfig.get('deposit.tracking_id.destination_owner'),
      this.systemConfig.getNumber(
        'deposit.large_transfer.min_amount',
        4000000000,
      ),
      this.systemConfig.get('deposit.large_transfer.destination_account'),
      this.systemConfig.get('deposit.large_transfer.destination_sheba'),
      this.systemConfig.getNumber('deposit.direct.daily_limit', 150000000),
      this.systemConfig.get('deposit.direct.destination_card'),
      this.systemConfig.getBoolean('deposit.card_to_card.enabled', true),
      this.systemConfig.getBoolean('deposit.bank_transfer.enabled', true),
      this.systemConfig.getBoolean('deposit.tracking_id.enabled', true),
      this.systemConfig.getBoolean('deposit.large_transfer.enabled', true),
      this.systemConfig.getBoolean('deposit.direct.enabled', true),
    ]);

    return {
      online: {
        enabled: onlineEnabled,
        minAmount: onlineMin,
        maxAmount: onlineMax,
        dailyLimit: onlineDailyLimit,
      },
      cardToCard: {
        enabled: c2cEnabled,
        dailyLimit: c2cDailyLimit,
        minAmount: c2cMin,
        maxAmount: c2cMax,
        destinationCard: this.maskCard(c2cDestCard),
        destinationCardFull: c2cDestCard,
        destinationOwner: c2cDestOwner,
        processingTime: c2cTime,
      },
      bankTransfer: {
        enabled: bankEnabled,
        dailyLimit: 0, // بدون محدودیت
        destinationAccount: bankDestAccount,
        destinationSheba: bankDestSheba,
        destinationOwner: bankDestOwner,
        processingTime: bankTime,
      },
      trackingId: {
        enabled: trackingEnabled,
        dailyLimit: trackingDailyLimit,
        destinationAccount: trackingDestAccount,
        destinationSheba: trackingDestSheba,
        destinationOwner: trackingDestOwner,
        processingTime: 'سیکل پایا',
      },
      largeTransfer: {
        enabled: largeEnabled,
        minAmount: largeMin,
        destinationAccount: largeDestAccount,
        destinationSheba: largeDestSheba,
      },
      direct: {
        enabled: directEnabled,
        dailyLimit: directDailyLimit,
        destinationCard: this.maskCard(directDestCard),
        destinationCardFull: directDestCard,
      },
    };
  }

  // ══════════════════════════════════════════
  // ── بررسی فعال بودن روش واریز (قابل تنظیم از پنل ادمین) ──
  // ══════════════════════════════════════════
  async assertDepositMethodEnabled(method: string) {
    const enabled = await this.systemConfig.getBoolean(
      `deposit.${method}.enabled`,
      true,
    );
    if (!enabled) {
      throw new ForbiddenException(
        'این روش واریز در حال حاضر غیرفعال است. لطفاً از روش دیگری استفاده کنید',
      );
    }
  }

  // ══════════════════════════════════════════
  // ── واریز کارت به کارت ──
  // ══════════════════════════════════════════
  //
  // ⚠ این مرحله فقط اطلاعات کارت مقصد را برمی‌گرداند و هیچ رکوردی نمی‌سازد. قبلاً
  // همین‌جا یک تراکنش PENDING ساخته می‌شد که حتی بدون هیچ واریزی در «تراکنش‌ها»ی کاربر
  // می‌ماند و هیچ مسیر تأییدی در پنل ادمین نداشت. اکنون پس از واریز، کاربر فیش را ارسال
  // می‌کند (POST /wallet/deposits/manual + آپلود رسید) و درخواست در صف «درخواست‌های واریز»
  // ادمین بررسی می‌شود؛ تراکنش فقط هنگام تأیید و شارژ واقعی کیف پول ثبت می‌شود.
  async initiateCardToCard(
    userId: string,
    sourceCardId: string,
    amount: number,
  ) {
    const { bankAccount, destination } = await this.deposits.prepareManual(
      userId,
      'CARD_TO_CARD',
      sourceCardId,
      amount,
    );

    return {
      destinationCard: this.maskCard(destination.card),
      destinationCardFull: destination.card,
      destinationOwner: destination.owner,
      sourceCardNumber: bankAccount.cardNumber,
      amount,
      processingTime: await this.systemConfig.get(
        'deposit.card_to_card.processing_time',
        'پس از بررسی فیش توسط کارشناس',
      ),
      message:
        'پس از انجام واریز، تصویر فیش را ارسال کنید تا پس از بررسی، کیف پول شما شارژ شود',
    };
  }

  // ══════════════════════════════════════════
  // ── واریز حساب به حساب — فقط اطلاعات حساب مقصد ──
  // ══════════════════════════════════════════
  async initiateBankTransfer(userId: string, sourceCardId: string) {
    const { bankAccount, destination } = await this.deposits.prepareManual(
      userId,
      'BANK_TRANSFER',
      sourceCardId,
    );

    return {
      destinationAccount: destination.accountNumber,
      destinationSheba: destination.sheba,
      destinationOwner: destination.owner,
      sourceCardNumber: bankAccount.cardNumber,
      processingTime: await this.systemConfig.get(
        'deposit.bank_transfer.processing_time',
      ),
    };
  }

  // ══════════════════════════════════════════
  // ── دریافت شناسه واریز (Tracking ID) ──
  // ══════════════════════════════════════════
  async getTrackingIdDeposit(userId: string, sourceCardId: string) {
    await this.assertDepositMethodEnabled('tracking_id');
    await this.checkUserIdentity(userId);

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: sourceCardId, userId },
    });
    if (!bankAccount) throw new NotFoundException('کارت بانکی یافت نشد');

    const destAccount = await this.systemConfig.get(
      'deposit.tracking_id.destination_account',
    );
    const destSheba = await this.systemConfig.get(
      'deposit.tracking_id.destination_sheba',
    );
    const destOwner = await this.systemConfig.get(
      'deposit.tracking_id.destination_owner',
    );

    // شناسه واریز = wallet card number که unique هست
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    return {
      trackingId: wallet.cardNumber, // شناسه اختصاصی کاربر
      destinationAccount: destAccount,
      destinationSheba: destSheba,
      destinationOwner: destOwner,
      sourceCard: bankAccount.cardNumber,
      instruction: 'شناسه واریز را حتماً در قسمت شناسه پایا وارد کنید',
    };
  }

  // ══════════════════════════════════════════
  // ── درخواست برداشت ──
  // ══════════════════════════════════════════
  async requestWithdrawal(
    userId: string,
    bankAccountId: string,
    amount: number,
  ) {
    await this.checkUserIdentity(userId);

    // بررسی محدودیت‌ها
    const [minAmount, maxAmount, dailyLimit, monthlyLimit] = await Promise.all([
      this.systemConfig.getNumber('withdrawal.min_amount', 100000),
      this.systemConfig.getNumber('withdrawal.max_amount', 2000000000),
      this.systemConfig.getNumber('withdrawal.daily_limit', 2000000000),
      this.systemConfig.getNumber('withdrawal.monthly_limit', 5000000000),
    ]);

    if (amount < minAmount)
      throw new BadRequestException(
        `حداقل مبلغ برداشت ${(minAmount / 10).toLocaleString('fa-IR')} تومان است`,
      );
    if (amount > maxAmount)
      throw new BadRequestException(
        `حداکثر مبلغ برداشت در یک تراکنش ${(maxAmount / 10).toLocaleString('fa-IR')} تومان است`,
      );

    // چک سقف روزانه
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayWithdrawal = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: 'WITHDRAWAL',
        status: { in: ['PENDING', 'COMPLETED'] },
        createdAt: { gte: today },
      },
      _sum: { amountRial: true },
    });
    const usedToday = Number(todayWithdrawal._sum.amountRial ?? 0);
    if (usedToday + amount > dailyLimit) {
      throw new BadRequestException(
        `سقف برداشت روزانه ${(dailyLimit / 10).toLocaleString('fa-IR')} تومان است`,
      );
    }

    // چک سقف ماهانه
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthWithdrawal = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: 'WITHDRAWAL',
        status: { in: ['PENDING', 'COMPLETED'] },
        createdAt: { gte: firstOfMonth },
      },
      _sum: { amountRial: true },
    });
    const usedMonth = Number(monthWithdrawal._sum.amountRial ?? 0);
    if (usedMonth + amount > monthlyLimit) {
      throw new BadRequestException(
        `سقف برداشت ماهانه ${(monthlyLimit / 10).toLocaleString('fa-IR')} تومان است`,
      );
    }

    // بررسی حساب بانکی
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId, isVerified: true },
    });
    if (!bankAccount)
      throw new NotFoundException('حساب بانکی تایید شده یافت نشد');

    const feeRial = await this.calcWithdrawalFee(amount);
    if (feeRial >= amount) {
      throw new BadRequestException('مبلغ برداشت باید بیشتر از کارمزد باشد');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // قفل کیف پول: دو درخواست همزمان نمی‌توانند هر دو از یک موجودی رزرو کنند
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new NotFoundException('کیف پول یافت نشد');
      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${wallet.id}::uuid FOR UPDATE`;
      const fresh = await tx.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      });

      const holdRial = await this.getActiveHoldRial(wallet.id, tx);
      const availableBalance = Number(fresh.rialBalance) - holdRial;
      if (availableBalance < amount) {
        throw new BadRequestException(
          `موجودی کافی نیست. موجودی قابل برداشت: ${(availableBalance / 10).toLocaleString('fa-IR')} تومان`,
        );
      }

      // رزرو تا پرداخت/رد/لغو صریح درخواست نگه داشته می‌شود (منقضی نمی‌شود)
      const hold = await tx.walletHold.create({
        data: {
          walletId: wallet.id,
          amountRial: amount,
          holdType: 'WITHDRAWAL',
          expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
        },
      });
      const requestNumber = await this.documentSequence.next(tx, 'WDR');
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          userId,
          bankAccountId,
          amountRial: amount,
          feeRial,
          netAmountRial: amount - feeRial,
          requestNumber,
          holdId: hold.id,
          status: 'PENDING',
          destinationSnapshot: {
            bankName: bankAccount.bankName,
            cardNumber: bankAccount.cardNumber,
            sheba: bankAccount.sheba,
            accountNumber: bankAccount.accountNumber,
          },
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amountRial: amount,
          feeAmount: feeRial || null,
          status: 'PENDING',
          description: `withdrawal:${withdrawal.id}|to:${bankAccount.cardNumber}|hold:${hold.id}`,
        },
      });
      await tx.withdrawalRequest.update({
        where: { id: withdrawal.id },
        data: { transactionId: transaction.id },
      });

      return { transaction, withdrawal, hold };
    });

    const processingTime = await this.systemConfig.get(
      'withdrawal.processing_time',
    );

    void this.smsTemplates.sendToUser(
      'WITHDRAWAL_REQUESTED',
      userId,
      {
        amount: (amount / 10).toLocaleString('fa-IR'),
        requestNumber: result.withdrawal.requestNumber,
      },
      { referenceType: 'WITHDRAWAL', referenceId: result.withdrawal.id },
    );

    return {
      withdrawalId: result.withdrawal.id,
      requestNumber: result.withdrawal.requestNumber,
      transactionId: result.transaction.id,
      amount,
      feeRial,
      netAmountRial: amount - feeRial,
      bankAccountId,
      bankName: bankAccount.bankName,
      cardNumber: this.maskCard(bankAccount.cardNumber),
      processingTime,
      message: 'درخواست برداشت با موفقیت ثبت شد',
    };
  }

  /** کارمزد برداشت طبق تنظیمات سیستم (درصد + ثابت، با سقف اختیاری) */
  async calcWithdrawalFee(amountRial: number): Promise<number> {
    const [percent, fixed, max] = await Promise.all([
      this.systemConfig.getNumber('withdrawal.fee_percent', 0),
      this.systemConfig.getNumber('withdrawal.fee_fixed_rial', 0),
      this.systemConfig.getNumber('withdrawal.fee_max_rial', 0),
    ]);
    let fee =
      Math.round((amountRial * Math.max(0, percent)) / 100) +
      Math.max(0, fixed);
    if (max > 0) fee = Math.min(fee, max);
    return Math.max(0, Math.round(fee));
  }

  // ══════════════════════════════════════════
  // ── فهرست و لغو درخواست‌های برداشت کاربر ──
  // ══════════════════════════════════════════
  async listMyWithdrawals(userId: string, page = 1, limit = 20) {
    const take = Math.min(50, Math.max(1, limit));
    const [items, total] = await Promise.all([
      this.prisma.withdrawalRequest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (Math.max(1, page) - 1) * take,
        take,
        include: {
          bankAccount: { select: { bankName: true, cardNumber: true } },
        },
      }),
      this.prisma.withdrawalRequest.count({ where: { userId } }),
    ]);
    return {
      total,
      page,
      items: items.map((w) => ({
        id: w.id,
        requestNumber: w.requestNumber,
        status: w.status,
        amountRial: w.amountRial.toString(),
        feeRial: w.feeRial.toString(),
        netAmountRial: (w.netAmountRial ?? w.amountRial).toString(),
        bankName: w.bankAccount.bankName,
        cardNumber: this.maskCard(w.bankAccount.cardNumber),
        bankReference: w.status === 'PROCESSED' ? w.bankReference : null,
        rejectionReason: w.rejectionReason,
        createdAt: w.createdAt,
        paidAt: w.paidAt,
      })),
    };
  }

  async cancelMyWithdrawal(userId: string, withdrawalId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT 1 FROM "withdrawal_requests" WHERE "id" = ${withdrawalId}::uuid FOR UPDATE`;
      const w = await tx.withdrawalRequest.findFirst({
        where: { id: withdrawalId, userId },
      });
      if (!w) throw new NotFoundException('درخواست برداشت یافت نشد');
      if (w.status === 'CANCELLED') {
        return { message: 'این درخواست قبلاً لغو شده است' };
      }
      if (w.status !== 'PENDING') {
        throw new BadRequestException(
          'فقط درخواست‌های در انتظار بررسی قابل لغو هستند',
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
      await tx.withdrawalRequest.update({
        where: { id: w.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      return {
        message: 'درخواست برداشت لغو شد و مبلغ به موجودی قابل برداشت بازگشت',
      };
    });
  }

  // ══════════════════════════════════════════
  // ── دریافت config برداشت ──
  // ══════════════════════════════════════════
  async getWithdrawalConfig(userId: string) {
    const [minAmount, maxAmount, dailyLimit, monthlyLimit, processingTime] =
      await Promise.all([
        this.systemConfig.getNumber('withdrawal.min_amount', 100000),
        this.systemConfig.getNumber('withdrawal.max_amount', 2000000000),
        this.systemConfig.getNumber('withdrawal.daily_limit', 2000000000),
        this.systemConfig.getNumber('withdrawal.monthly_limit', 5000000000),
        this.systemConfig.get('withdrawal.processing_time'),
      ]);

    // محاسبه مقدار مصرف شده امروز و این ماه
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayUsed, monthUsed] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'WITHDRAWAL',
          status: { in: ['PENDING', 'COMPLETED'] },
          createdAt: { gte: today },
        },
        _sum: { amountRial: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'WITHDRAWAL',
          status: { in: ['PENDING', 'COMPLETED'] },
          createdAt: { gte: firstOfMonth },
        },
        _sum: { amountRial: true },
      }),
    ]);

    const [feePercent, feeFixedRial, feeMaxRial] = await Promise.all([
      this.systemConfig.getNumber('withdrawal.fee_percent', 0),
      this.systemConfig.getNumber('withdrawal.fee_fixed_rial', 0),
      this.systemConfig.getNumber('withdrawal.fee_max_rial', 0),
    ]);

    return {
      minAmount,
      maxAmount,
      dailyLimit,
      monthlyLimit,
      processingTime,
      feePercent,
      feeFixedRial,
      feeMaxRial,
      usedToday: Number(todayUsed._sum.amountRial ?? 0),
      usedThisMonth: Number(monthUsed._sum.amountRial ?? 0),
      remainingToday: dailyLimit - Number(todayUsed._sum.amountRial ?? 0),
      remainingThisMonth: monthlyLimit - Number(monthUsed._sum.amountRial ?? 0),
    };
  }

  // ══════════════════════════════════════════
  // ── helper: بررسی احراز هویت ──
  // ══════════════════════════════════════════
  private async checkUserIdentity(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException(
        'برای انجام این عملیات ابتدا باید احراز هویت کنید',
      );
    }
  }

  // ══════════════════════════════════════════
  // ── کانفیگ و محدودیت‌های انتقال داخلی (فقط طلا) ──
  // ══════════════════════════════════════════
  async getTransferConfig(userId: string) {
    const [dailyLimitGrams, monthlyLimitGrams] = await Promise.all([
      this.systemConfig.getNumber('transfer.daily_limit_grams', 5),
      this.systemConfig.getNumber('transfer.monthly_limit_grams', 20),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [todayUsed, monthUsed] = await Promise.all([
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'TRANSFER_OUT',
          status: 'COMPLETED',
          createdAt: { gte: today },
        },
        _sum: { amountGrams: true },
      }),
      this.prisma.transaction.aggregate({
        where: {
          userId,
          type: 'TRANSFER_OUT',
          status: 'COMPLETED',
          createdAt: { gte: firstOfMonth },
        },
        _sum: { amountGrams: true },
      }),
    ]);

    const usedTodayGrams = Number(todayUsed._sum.amountGrams ?? 0);
    const usedThisMonthGrams = Number(monthUsed._sum.amountGrams ?? 0);

    // سقف <= ۰ به معنای «بدون محدودیت» است (مطابق assertWithinTransferLimit)
    const remaining = (limit: number, used: number) =>
      limit <= 0 ? Number.MAX_SAFE_INTEGER : Math.max(0, limit - used);

    return {
      dailyLimitGrams,
      monthlyLimitGrams,
      usedTodayGrams,
      usedThisMonthGrams,
      remainingTodayGrams: remaining(dailyLimitGrams, usedTodayGrams),
      remainingThisMonthGrams: remaining(monthlyLimitGrams, usedThisMonthGrams),
    };
  }

  // ══════════════════════════════════════════
  // ── انتقال داخلی کیف پول (فقط طلا، بدون کارمزد) ──
  // ══════════════════════════════════════════
  async internalTransfer(
    userId: string,
    destinationCardNumber: string,
    amountGrams: number,
  ) {
    await this.checkUserIdentity(userId);

    const gramsAmount = new Prisma.Decimal(amountGrams ?? 0);

    if (gramsAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('مقدار طلا برای انتقال باید مثبت باشد');
    }

    const senderWallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!senderWallet) throw new NotFoundException('کیف پول یافت نشد');

    if (senderWallet.cardNumber === destinationCardNumber) {
      throw new BadRequestException(
        'امکان انتقال به کیف پول خودتان وجود ندارد',
      );
    }

    const destinationWallet = await this.prisma.wallet.findUnique({
      where: { cardNumber: destinationCardNumber },
    });
    if (!destinationWallet) {
      throw new NotFoundException('کیف پول مقصد یافت نشد');
    }

    // ── بررسی محدودیت‌های داینامیک روزانه/ماهانه ──
    const [dailyLimitGrams, monthlyLimitGrams] = await Promise.all([
      this.systemConfig.getDecimal('transfer.daily_limit_grams', '5'),
      this.systemConfig.getDecimal('transfer.monthly_limit_grams', '20'),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const result = await this.prisma.$transaction(async (tx) => {
      // ترتیب ثابت قفل‌گیری بر اساس id برای جلوگیری از deadlock
      const walletIds = [senderWallet.id, destinationWallet.id].sort();
      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${walletIds[0]}::uuid FOR UPDATE`;
      await tx.$executeRaw`SELECT 1 FROM "wallets" WHERE "id" = ${walletIds[1]}::uuid FOR UPDATE`;

      const freshSender = await tx.wallet.findUnique({
        where: { id: senderWallet.id },
      });
      if (!freshSender) throw new NotFoundException('کیف پول یافت نشد');

      // ── بررسی محدودیت‌های داینامیک روزانه/ماهانه (داخل تراکنش، بعد از قفل) ──
      await this.assertWithinTransferLimit(
        tx,
        userId,
        gramsAmount,
        dailyLimitGrams,
        today,
        'سقف انتقال روزانه',
        'گرم',
      );
      await this.assertWithinTransferLimit(
        tx,
        userId,
        gramsAmount,
        monthlyLimitGrams,
        firstOfMonth,
        'سقف انتقال ماهانه',
        'گرم',
      );

      const availableGrams = new Prisma.Decimal(freshSender.goldBalanceGrams);
      if (availableGrams.lessThan(gramsAmount)) {
        throw new BadRequestException('موجودی طلا کافی نیست');
      }

      await tx.wallet.update({
        where: { id: senderWallet.id },
        data: { goldBalanceGrams: { decrement: gramsAmount } },
      });
      await tx.wallet.update({
        where: { id: destinationWallet.id },
        data: { goldBalanceGrams: { increment: gramsAmount } },
      });

      const outTransaction = await tx.transaction.create({
        data: {
          userId,
          walletId: senderWallet.id,
          type: 'TRANSFER_OUT',
          amountGrams: gramsAmount,
          status: 'COMPLETED',
          description: `transfer_out|to:${destinationWallet.cardNumber}`,
        },
      });

      const inTransaction = await tx.transaction.create({
        data: {
          userId: destinationWallet.userId,
          walletId: destinationWallet.id,
          type: 'TRANSFER_IN',
          amountGrams: gramsAmount,
          status: 'COMPLETED',
          description: `transfer_in|from:${senderWallet.cardNumber}`,
          relatedTransactionId: outTransaction.id,
        },
      });

      await tx.transaction.update({
        where: { id: outTransaction.id },
        data: { relatedTransactionId: inTransaction.id },
      });

      return { outTransaction, inTransaction };
    });

    return {
      transactionId: result.outTransaction.id,
      destinationCardNumber: this.maskCard(destinationWallet.cardNumber),
      amountGrams: Number(gramsAmount),
      message: 'انتقال با موفقیت انجام شد',
    };
  }

  private async assertWithinTransferLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: Prisma.Decimal,
    limit: Prisma.Decimal,
    since: Date,
    limitLabel: string,
    unit: string,
  ) {
    if (limit.lessThanOrEqualTo(0)) return;

    const used = await tx.transaction.aggregate({
      where: {
        userId,
        type: 'TRANSFER_OUT',
        status: 'COMPLETED',
        createdAt: { gte: since },
      },
      _sum: { amountGrams: true },
    });

    const usedAmount = new Prisma.Decimal(used._sum.amountGrams ?? 0);

    if (usedAmount.plus(amount).greaterThan(limit)) {
      throw new BadRequestException(
        `${limitLabel} ${limit.toString()} ${unit} است`,
      );
    }
  }
  private async getActiveHoldRial(
    walletId: string,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    const holds = await tx.walletHold.findMany({
      where: { walletId, expiresAt: { gt: new Date() } },
    });
    return holds.reduce(
      (sum, h) => sum + (h.amountRial ? Number(h.amountRial) : 0),
      0,
    );
  }

  private maskCard(card: string): string {
    if (!card || card.length < 8) return card;
    return (
      card.slice(0, 4) +
      ' ' +
      card.slice(4, 8).replace(/./g, '*') +
      ' ' +
      card.slice(8, 12).replace(/./g, '*') +
      ' ' +
      card.slice(-4)
    );
  }
}
