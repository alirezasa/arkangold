import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BankInquiryService } from './bank-inquiry.service';
import { AddBankAccountDto } from '@arkan-gold/shared';

const MAX_BANK_ACCOUNTS = 5;

@Injectable()
export class BankAccountService {
  constructor(
    private prisma: PrismaService,
    private bankInquiry: BankInquiryService,
  ) {}

  // ── لیست حساب‌های کاربر ──
  async getAccounts(userId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    // mask کردن اطلاعات حساس
    return accounts.map((acc) => ({
      id: acc.id,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber
        ? this.maskAccountNumber(acc.accountNumber)
        : null,
      cardNumber: this.bankInquiry.maskCard(acc.cardNumber),
      cardLast4: acc.cardNumber.slice(-4),
      sheba: acc.sheba ? this.maskSheba(acc.sheba) : null,
      isVerified: acc.isVerified,
      isDefault: acc.isDefault,
      createdAt: acc.createdAt,
    }));
  }

  // ── افزودن حساب جدید ──
  async addAccount(userId: string, dto: AddBankAccountDto) {
    // چک احراز هویت
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new ForbiddenException(
        'برای افزودن حساب بانکی ابتدا باید احراز هویت کنید',
      );
    }

    // چک تعداد حساب‌ها
    const count = await this.prisma.bankAccount.count({ where: { userId } });
    if (count >= MAX_BANK_ACCOUNTS) {
      throw new BadRequestException(
        `حداکثر ${MAX_BANK_ACCOUNTS} حساب بانکی مجاز است`,
      );
    }

    // چک کارت تکراری
    const existing = await this.prisma.bankAccount.findFirst({
      where: { userId, cardNumber: dto.cardNumber },
    });
    if (existing) {
      throw new ConflictException('این شماره کارت قبلاً ثبت شده است');
    }

    // چک شبا تکراری
    if (dto.sheba) {
      const existingSheba = await this.prisma.bankAccount.findFirst({
        where: { userId, sheba: dto.sheba },
      });
      if (existingSheba) {
        throw new ConflictException('این شماره شبا قبلاً ثبت شده است');
      }
    }

    // تشخیص بانک از BIN کارت (اگر bankName ارسال نشده)
    const bankName =
      dto.bankName || this.bankInquiry.detectBankByCard(dto.cardNumber);

    // اولین حساب به صورت پیش‌فرض ثبت میشه
    const isFirst = count === 0;

    const account = await this.prisma.bankAccount.create({
      data: {
        userId,
        cardNumber: dto.cardNumber,
        sheba: dto.sheba,
        bankName,
        accountNumber: dto.accountNumber || '',
        isVerified: false,
        isDefault: isFirst,
      },
    });

    return {
      message: 'حساب بانکی با موفقیت ثبت شد و در انتظار تایید کارشناسان است',
      account: {
        id: account.id,
        bankName: account.bankName,
        cardLast4: account.cardNumber.slice(-4),
        cardNumber: this.bankInquiry.maskCard(account.cardNumber),
        sheba: account.sheba ? this.maskSheba(account.sheba) : null,
        isVerified: account.isVerified,
        isDefault: account.isDefault,
      },
    };
  }

  // ── تنظیم حساب پیش‌فرض ──
  async setDefault(userId: string, accountId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
    });
    if (!account) throw new NotFoundException('حساب بانکی یافت نشد');
    if (!account.isVerified) {
      throw new BadRequestException(
        'فقط حساب‌های تایید شده می‌توانند پیش‌فرض شوند',
      );
    }

    // transaction: همه رو false کن، این رو true
    await this.prisma.$transaction([
      this.prisma.bankAccount.updateMany({
        where: { userId },
        data: { isDefault: false },
      }),
      this.prisma.bankAccount.update({
        where: { id: accountId },
        data: { isDefault: true },
      }),
    ]);

    return { message: 'حساب پیش‌فرض با موفقیت تغییر کرد' };
  }

  // ── متدهای mask ──
  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return '****' + accountNumber.slice(-4);
  }

  private maskSheba(sheba: string): string {
    return sheba.substring(0, 6) + '****' + sheba.substring(sheba.length - 4);
  }
}
