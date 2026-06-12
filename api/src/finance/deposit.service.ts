import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../config/system-config.service';
import { AccountingService } from '../wallet/accounting.service';
import {
  GatewayDepositDto,
  ConfirmGatewayDepositDto,
} from '@arkan-gold/shared';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    private prisma: PrismaService,
    private systemConfig: SystemConfigService,
    private accounting: AccountingService,
  ) {}

  // ── اعتبارسنجی مبلغ واریز درگاه ──
  async validateGatewayDeposit(userId: string, dto: GatewayDepositDto) {
    const limits = this.systemConfig.getLimits();

    // چک احراز هویت
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException('برای واریز باید احراز هویت کنید');
    }

    // چک سقف‌های dynamic از DB
    if (dto.amountRial < limits.depositGatewayMin) {
      throw new BadRequestException(
        `حداقل مبلغ واریز ${limits.depositGatewayMin.toLocaleString('fa-IR')} تومان است`,
      );
    }
    if (dto.amountRial > limits.depositGatewayMax) {
      throw new BadRequestException(
        `سقف واریز درگاه ${limits.depositGatewayMax.toLocaleString('fa-IR')} تومان است. برای مبالغ بالاتر از واریز شبا استفاده کنید`,
      );
    }

    return {
      valid: true,
      amountRial: dto.amountRial,
      amountFormatted: dto.amountRial.toLocaleString('fa-IR'),
      limits: {
        min: limits.depositGatewayMin,
        max: limits.depositGatewayMax,
        minFormatted: limits.depositGatewayMin.toLocaleString('fa-IR'),
        maxFormatted: limits.depositGatewayMax.toLocaleString('fa-IR'),
      },
      // TODO: ساخت لینک درگاه (ZarinPal/Mellat/...)
      // redirectUrl: await this.paymentGateway.createPayment(dto.amountRial)
      message: 'در حال اتصال به درگاه پرداخت...',
    };
  }

  // ── تایید واریز موفق از callback درگاه ──
  async confirmGatewayDeposit(userId: string, dto: ConfirmGatewayDepositDto) {
    const limits = this.systemConfig.getLimits();

    // چک تکراری نبودن reference code
    const duplicate = await this.prisma.transaction.findFirst({
      where: { description: { contains: dto.referenceCode } },
    });
    if (duplicate) {
      throw new BadRequestException('این تراکنش قبلاً پردازش شده است');
    }

    if (
      dto.amountRial < limits.depositGatewayMin ||
      dto.amountRial > limits.depositGatewayMax
    ) {
      throw new BadRequestException('مبلغ واریز خارج از محدوده مجاز است');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
    });
    if (!wallet) throw new NotFoundException('کیف پول یافت نشد');

    return this.prisma.$transaction(async (tx) => {
      // ثبت تراکنش
      const transaction = await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'DEPOSIT',
          amountRial: new Prisma.Decimal(dto.amountRial),
          status: 'COMPLETED',
          description: `واریز درگاه | کد پیگیری: ${dto.referenceCode}`,
        },
      });

      // بروزرسانی موجودی
      await tx.wallet.update({
        where: { id: wallet.id },
        data: {
          rialBalance: { increment: new Prisma.Decimal(dto.amountRial) },
        },
      });

      // ثبت سند حسابداری
      await this.accounting.recordDeposit(transaction.id, dto.amountRial);

      this.logger.log(
        `[Deposit] واریز موفق: userId=${userId} amount=${dto.amountRial} ref=${dto.referenceCode}`,
      );

      return {
        success: true,
        transactionId: transaction.id,
        amountRial: dto.amountRial,
        amountFormatted: dto.amountRial.toLocaleString('fa-IR'),
        referenceCode: dto.referenceCode,
        message: `${dto.amountRial.toLocaleString('fa-IR')} تومان با موفقیت به کیف پول شما افزوده شد`,
      };
    });
  }

  // ── اطلاعات واریز شبا + چک کارت ──
  async getShebaDepositInfo(userId: string) {
    const limits = this.systemConfig.getLimits();

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException('برای واریز باید احراز هویت کنید');
    }

    // کارت‌های تایید شده کاربر
    const verifiedCards = await this.prisma.bankAccount.findMany({
      where: { userId, isVerified: true },
      orderBy: { isDefault: 'desc' },
      select: {
        id: true,
        bankName: true,
        cardNumber: true,
        sheba: true,
        isDefault: true,
      },
    });

    return {
      platformSheba: limits.platformSheba,
      platformBankName: limits.platformBankName,
      minAmount: limits.depositShebaMin,
      minAmountFormatted: limits.depositShebaMin.toLocaleString('fa-IR'),
      hasVerifiedCard: verifiedCards.length > 0,
      verifiedCards: verifiedCards.map((c) => ({
        id: c.id,
        bankName: c.bankName,
        cardLast4: c.cardNumber.slice(-4),
        isDefault: c.isDefault,
      })),
      instructions: [
        {
          step: 1,
          text: 'مطمئن شوید کارت بانکی تایید‌شده در پنل ثبت کرده‌اید',
        },
        {
          step: 2,
          text: `مبلغ را به شبای پلتفرم (${limits.platformBankName}) واریز کنید`,
        },
        {
          step: 3,
          text: 'در بخش «بابت» گزینه «امور سرمایه‌گذاری و بورس» را انتخاب کنید',
        },
        {
          step: 4,
          text: 'پس از پردازش پایا (تا یک روز کاری) موجودی شارژ می‌شود',
        },
      ],
      warnings: [
        'واریز با کارت هدیه، بن‌کارت یا کارت فاقد شبا ممنوع است',
        'واریز باید از حساب بانکی به نام خودتان باشد',
        'در صورت عدم تطابق، مبلغ تا ۳ روز کاری برگشت داده می‌شود',
        'در صورت اختلال بانکی، پلتفرم مسئولیتی در قبال تأخیر ندارد',
      ],
    };
  }
}
