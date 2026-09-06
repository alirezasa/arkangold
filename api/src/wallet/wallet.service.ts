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

const D0 = new Prisma.Decimal(0);

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
    private accountingService: AccountingService,
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
    ]);

    return {
      online: {
        enabled: onlineEnabled,
        minAmount: onlineMin,
        maxAmount: onlineMax,
        dailyLimit: onlineDailyLimit,
      },
      cardToCard: {
        enabled: true,
        dailyLimit: c2cDailyLimit,
        minAmount: c2cMin,
        maxAmount: c2cMax,
        destinationCard: this.maskCard(c2cDestCard),
        destinationCardFull: c2cDestCard,
        destinationOwner: c2cDestOwner,
        processingTime: c2cTime,
      },
      bankTransfer: {
        enabled: true,
        dailyLimit: 0, // بدون محدودیت
        destinationAccount: bankDestAccount,
        destinationSheba: bankDestSheba,
        destinationOwner: bankDestOwner,
        processingTime: bankTime,
      },
      trackingId: {
        enabled: true,
        dailyLimit: trackingDailyLimit,
        destinationAccount: trackingDestAccount,
        destinationSheba: trackingDestSheba,
        destinationOwner: trackingDestOwner,
        processingTime: 'سیکل پایا',
      },
      largeTransfer: {
        enabled: true,
        minAmount: largeMin,
        destinationAccount: largeDestAccount,
        destinationSheba: largeDestSheba,
      },
      direct: {
        enabled: true,
        dailyLimit: directDailyLimit,
        destinationCard: this.maskCard(directDestCard),
        destinationCardFull: directDestCard,
      },
    };
  }

  // ══════════════════════════════════════════
  // ── بررسی سقف واریز روزانه ──
  // ══════════════════════════════════════════
  async checkDailyDepositLimit(userId: string, method: string, amount: number) {
    const dailyLimitKey = `deposit.${method}.daily_limit`;
    const dailyLimit = await this.systemConfig.getNumber(dailyLimitKey, 0);
    if (dailyLimit === 0) return; // بدون محدودیت

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // پیدا کردن تراکنش‌های امروز همین روش
    const todayDeposit = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: 'DEPOSIT',
        status: { in: ['PENDING', 'COMPLETED'] },
        createdAt: { gte: today },
        description: { contains: method },
      },
      _sum: { amountRial: true },
    });

    const used = Number(todayDeposit._sum.amountRial ?? 0);
    if (used + amount > dailyLimit) {
      const remaining = dailyLimit - used;
      throw new BadRequestException(
        `سقف واریز روزانه این روش ${(dailyLimit / 10).toLocaleString('fa-IR')} تومان است. باقی‌مانده: ${(remaining / 10).toLocaleString('fa-IR')} تومان`,
      );
    }
  }

  // ══════════════════════════════════════════
  // ── ثبت درخواست واریز کارت به کارت ──
  // ══════════════════════════════════════════
  async initiateCardToCard(
    userId: string,
    sourceCardId: string,
    amount: number,
  ) {
    await this.checkUserIdentity(userId);
    await this.checkDailyDepositLimit(userId, 'card_to_card', amount);

    const minAmount = await this.systemConfig.getNumber(
      'deposit.card_to_card.min_amount',
      100000,
    );
    const maxAmount = await this.systemConfig.getNumber(
      'deposit.card_to_card.max_amount',
      150000000,
    );

    if (amount < minAmount)
      throw new BadRequestException(
        `حداقل مبلغ ${(minAmount / 10).toLocaleString('fa-IR')} تومان است`,
      );
    if (amount > maxAmount)
      throw new BadRequestException(
        `حداکثر مبلغ ${(maxAmount / 10).toLocaleString('fa-IR')} تومان است`,
      );

    // بررسی کارت مبدا
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: sourceCardId, userId },
    });
    if (!bankAccount) throw new NotFoundException('کارت بانکی یافت نشد');

    const destCard = await this.systemConfig.get(
      'deposit.card_to_card.destination_card',
    );
    const destOwner = await this.systemConfig.get(
      'deposit.card_to_card.destination_owner',
    );

    // ثبت تراکنش در انتظار
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'DEPOSIT',
        amountRial: amount,
        status: 'PENDING',
        description: `card_to_card|from:${bankAccount.cardNumber}|to:${destCard}`,
      },
    });

    return {
      transactionId: transaction.id,
      destinationCard: this.maskCard(destCard),
      destinationCardFull: destCard,
      destinationOwner: destOwner,
      amount,
      processingTime: await this.systemConfig.get(
        'deposit.card_to_card.processing_time',
      ),
      message: 'پس از انجام واریز روی "واریز را انجام دادم" کلیک کنید',
    };
  }

  // ── تایید انجام واریز کارت به کارت توسط کاربر ──
  async confirmCardToCard(userId: string, transactionId: string) {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId, type: 'DEPOSIT', status: 'PENDING' },
    });
    if (!tx) throw new NotFoundException('تراکنش یافت نشد');

    // وضعیت PENDING می‌مونه تا ادمین تایید کنه
    await this.prisma.transaction.update({
      where: { id: transactionId },
      data: { description: (tx.description ?? '') + '|confirmed_by_user' },
    });

    return {
      message:
        'درخواست واریز ثبت شد. پس از تایید کارشناسان، مبلغ به کیف پول شما افزوده می‌شود.',
    };
  }

  // ══════════════════════════════════════════
  // ── ثبت درخواست واریز حساب به حساب ──
  // ══════════════════════════════════════════
  async initiateBankTransfer(userId: string, sourceCardId: string) {
    await this.checkUserIdentity(userId);

    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: sourceCardId, userId },
    });
    if (!bankAccount) throw new NotFoundException('کارت بانکی یافت نشد');

    const destAccount = await this.systemConfig.get(
      'deposit.bank_transfer.destination_account',
    );
    const destSheba = await this.systemConfig.get(
      'deposit.bank_transfer.destination_sheba',
    );
    const destOwner = await this.systemConfig.get(
      'deposit.bank_transfer.destination_owner',
    );

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'DEPOSIT',
        status: 'PENDING',
        description: `bank_transfer|from:${bankAccount.cardNumber}`,
      },
    });

    return {
      transactionId: transaction.id,
      destinationAccount: destAccount,
      destinationSheba: destSheba,
      destinationOwner: destOwner,
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
  // ── واریز مبالغ بالا (پیش‌فاکتور) ──
  // ══════════════════════════════════════════
  async initiateLargeTransfer(userId: string, amount: number) {
    await this.checkUserIdentity(userId);

    const minAmount = await this.systemConfig.getNumber(
      'deposit.large_transfer.min_amount',
      4000000000,
    );
    if (amount < minAmount) {
      throw new BadRequestException(
        `برای واریز مبالغ بالا، حداقل مبلغ ${(minAmount / 10).toLocaleString('fa-IR')} تومان است`,
      );
    }

    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });

    const destAccount = await this.systemConfig.get(
      'deposit.large_transfer.destination_account',
    );
    const destSheba = await this.systemConfig.get(
      'deposit.large_transfer.destination_sheba',
    );

    const transaction = await this.prisma.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'DEPOSIT',
        amountRial: amount,
        status: 'PENDING',
        description: `large_transfer|amount:${amount}`,
      },
    });

    // پیش‌فاکتور (در واقع اطلاعاتی که کاربر باید ببره بانک)
    return {
      transactionId: transaction.id,
      proformaData: {
        amount,
        destinationAccount: destAccount,
        destinationSheba: destSheba,
        trackingId: wallet.cardNumber,
        recipientName: 'یارا تجارت الکترونیک بنیان',
        userFullName: user?.identity
          ? `${user.identity.firstName} ${user.identity.lastName}`
          : '',
        generatedAt: new Date().toISOString(),
      },
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

    // بررسی موجودی کافی
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    const holdRial = await this.getActiveHoldRial(wallet.id);
    const availableBalance = Number(wallet.rialBalance) - holdRial;
    if (availableBalance < amount) {
      throw new BadRequestException(
        `موجودی کافی نیست. موجودی قابل برداشت: ${(availableBalance / 10).toLocaleString('fa-IR')} تومان`,
      );
    }

    // بررسی حساب بانکی
    const bankAccount = await this.prisma.bankAccount.findFirst({
      where: { id: bankAccountId, userId, isVerified: true },
    });
    if (!bankAccount)
      throw new NotFoundException('حساب بانکی تایید شده یافت نشد');

    // ثبت hold روی موجودی و درخواست برداشت
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 روز
    const result = await this.prisma.$transaction(async (tx) => {
      const hold = await tx.walletHold.create({
        data: {
          walletId: wallet.id,
          amountRial: amount,
          holdType: 'WITHDRAWAL',
          expiresAt,
        },
      });
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          userId,
          bankAccountId,
          amountRial: amount,
          status: 'PENDING',
        },
      });

      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amountRial: amount,
          status: 'PENDING',
          description: `withdrawal:${withdrawal.id}|to:${bankAccount.cardNumber}|hold:${hold.id}`,
        },
      });

      return { transaction, withdrawal, hold };
    });

    const processingTime = await this.systemConfig.get(
      'withdrawal.processing_time',
    );

    return {
      withdrawalId: result.withdrawal.id,
      transactionId: result.transaction.id,
      amount,
      bankAccountId,
      bankName: bankAccount.bankName,
      cardNumber: this.maskCard(bankAccount.cardNumber),
      processingTime,
      message: 'درخواست برداشت با موفقیت ثبت شد',
    };
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

    return {
      minAmount,
      maxAmount,
      dailyLimit,
      monthlyLimit,
      processingTime,
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
  // ── انتقال داخلی کیف پول (بدون کارمزد) ──
  // ══════════════════════════════════════════
  async internalTransfer(
    userId: string,
    destinationCardNumber: string,
    amountRial?: number,
    amountGrams?: number,
  ) {
    await this.checkUserIdentity(userId);

    const rialAmount = amountRial ? new Prisma.Decimal(amountRial) : D0;
    const gramsAmount = amountGrams ? new Prisma.Decimal(amountGrams) : D0;

    if (rialAmount.lessThanOrEqualTo(0) && gramsAmount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'حداقل یکی از مبلغ ریالی یا مقدار طلا باید مثبت باشد',
      );
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
    const [
      dailyLimitRial,
      monthlyLimitRial,
      dailyLimitGrams,
      monthlyLimitGrams,
    ] = await Promise.all([
      this.systemConfig.getDecimal('transfer.daily_limit_rial', '4000000000'),
      this.systemConfig.getDecimal(
        'transfer.monthly_limit_rial',
        '10000000000',
      ),
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
      if (rialAmount.greaterThan(0)) {
        await this.assertWithinTransferLimit(
          tx,
          userId,
          'amountRial',
          rialAmount,
          dailyLimitRial,
          today,
          'سقف انتقال روزانه',
          'ریال',
        );
        await this.assertWithinTransferLimit(
          tx,
          userId,
          'amountRial',
          rialAmount,
          monthlyLimitRial,
          firstOfMonth,
          'سقف انتقال ماهانه',
          'ریال',
        );
      }

      if (gramsAmount.greaterThan(0)) {
        await this.assertWithinTransferLimit(
          tx,
          userId,
          'amountGrams',
          gramsAmount,
          dailyLimitGrams,
          today,
          'سقف انتقال روزانه',
          'گرم',
        );
        await this.assertWithinTransferLimit(
          tx,
          userId,
          'amountGrams',
          gramsAmount,
          monthlyLimitGrams,
          firstOfMonth,
          'سقف انتقال ماهانه',
          'گرم',
        );
      }

      const holdRial = await this.getActiveHoldRial(freshSender.id, tx);
      const availableRial = new Prisma.Decimal(freshSender.rialBalance).minus(
        holdRial,
      );
      const availableGrams = new Prisma.Decimal(freshSender.goldBalanceGrams);

      if (rialAmount.greaterThan(0) && availableRial.lessThan(rialAmount)) {
        throw new BadRequestException('موجودی ریالی کافی نیست');
      }
      if (gramsAmount.greaterThan(0) && availableGrams.lessThan(gramsAmount)) {
        throw new BadRequestException('موجودی طلا کافی نیست');
      }

      await tx.wallet.update({
        where: { id: senderWallet.id },
        data: {
          rialBalance: { decrement: rialAmount },
          goldBalanceGrams: { decrement: gramsAmount },
        },
      });
      await tx.wallet.update({
        where: { id: destinationWallet.id },
        data: {
          rialBalance: { increment: rialAmount },
          goldBalanceGrams: { increment: gramsAmount },
        },
      });

      const outTransaction = await tx.transaction.create({
        data: {
          userId,
          walletId: senderWallet.id,
          type: 'TRANSFER_OUT',
          amountRial: rialAmount.greaterThan(0) ? rialAmount : null,
          amountGrams: gramsAmount.greaterThan(0) ? gramsAmount : null,
          status: 'COMPLETED',
          description: `transfer_out|to:${destinationWallet.cardNumber}`,
        },
      });

      const inTransaction = await tx.transaction.create({
        data: {
          userId: destinationWallet.userId,
          walletId: destinationWallet.id,
          type: 'TRANSFER_IN',
          amountRial: rialAmount.greaterThan(0) ? rialAmount : null,
          amountGrams: gramsAmount.greaterThan(0) ? gramsAmount : null,
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
      amountRial: rialAmount.greaterThan(0) ? Number(rialAmount) : undefined,
      amountGrams: gramsAmount.greaterThan(0) ? Number(gramsAmount) : undefined,
      message: 'انتقال با موفقیت انجام شد',
    };
  }

  private async assertWithinTransferLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    field: 'amountRial' | 'amountGrams',
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
      _sum: { [field]: true },
    });

    const usedAmount = new Prisma.Decimal(
      ((used._sum as Record<string, unknown>)[field] as
        | Prisma.Decimal
        | number
        | null
        | undefined) ?? 0,
    );

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
