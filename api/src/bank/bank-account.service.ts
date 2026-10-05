import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BankInquiryService } from './bank-inquiry.service';
import {
  BankAccountInquiryService,
  BankInquiryData,
} from './bank-account-inquiry.service';
import { AddBankAccountDto } from '@arkan-gold/shared';
import { isValidLuhn } from '../common/utils/luhn.util';
import { isValidIranIban, normalizeIban } from '../common/utils/iban.util';
import { BankAccount, Prisma } from '../generated/prisma/client';
import { DEPOSIT_STATUS_LABELS } from '../integrations/interfaces/card-to-iban.interface';
import { SmsTemplateService } from '../notifications/sms-template.service';

const MAX_BANK_ACCOUNTS = 5;

@Injectable()
export class BankAccountService {
  private readonly logger = new Logger(BankAccountService.name);

  constructor(
    private prisma: PrismaService,
    private bankInquiry: BankInquiryService,
    private accountInquiry: BankAccountInquiryService,
    private smsTemplates: SmsTemplateService,
  ) {}

  // ── لیست حساب‌های کاربر ──
  async getAccounts(userId: string) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    return accounts.map((acc) => this.presentForUser(acc));
  }

  // ── افزودن کارت: فقط شماره کارت → استعلام مالکیت → تکمیل خودکار شبا ──
  async addAccount(userId: string, dto: AddBankAccountDto) {
    const cardNumber = dto.cardNumber;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const nationalCode = user.identity?.nationalCode;
    if (user.identity?.status !== 'VERIFIED' || !nationalCode) {
      throw new ForbiddenException(
        'برای افزودن کارت بانکی ابتدا باید احراز هویت کنید',
      );
    }

    // کارت‌های بانکی ایران رقم کنترل Luhn دارند؛ اشتباه تایپی قبل از استعلام هزینه‌دار گرفته می‌شود
    if (!isValidLuhn(cardNumber)) {
      throw new BadRequestException(
        'شماره کارت معتبر نیست؛ لطفاً ۱۶ رقم روی کارت را دوباره بررسی کنید',
      );
    }

    const active = await this.prisma.bankAccount.findMany({
      where: { userId, status: { not: 'REJECTED' } },
      select: { cardNumber: true },
    });
    if (active.length >= MAX_BANK_ACCOUNTS) {
      throw new BadRequestException(
        `حداکثر ${MAX_BANK_ACCOUNTS} کارت بانکی فعال مجاز است؛ برای افزودن کارت جدید، یکی از کارت‌های قبلی را حذف کنید`,
      );
    }
    if (active.some((a) => a.cardNumber === cardNumber)) {
      throw new ConflictException('این شماره کارت قبلاً ثبت شده است');
    }

    const outcome = await this.accountInquiry.inquire(cardNumber, nationalCode);

    if (outcome.kind === 'OWNER_MISMATCH' || outcome.kind === 'ACCOUNT_BLOCKED') {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: outcome.kind,
        message: outcome.message,
      });
    }

    if (outcome.data.sheba) {
      const duplicate = await this.prisma.bankAccount.findFirst({
        where: {
          userId,
          sheba: outcome.data.sheba,
          status: { not: 'REJECTED' },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          `حساب متصل به این کارت (شبای ${this.maskSheba(outcome.data.sheba)}) قبلاً با کارت ${this.bankInquiry.maskCard(duplicate.cardNumber)} ثبت شده است`,
        );
      }
    }

    // کارت ردشده‌ی قبلی با همین شماره جایگزین می‌شود تا تاریخچه تکراری نماند
    await this.prisma.bankAccount.deleteMany({
      where: {
        userId,
        cardNumber,
        status: 'REJECTED',
        withdrawalRequests: { none: {} },
      },
    });

    const verified = outcome.kind === 'VERIFIED';
    const hasDefault = verified
      ? await this.prisma.bankAccount.count({
          where: { userId, isDefault: true, isVerified: true },
        })
      : 1;

    const account = await this.prisma.bankAccount.create({
      data: {
        userId,
        cardNumber,
        ...this.inquiryFields(outcome.data, cardNumber),
        status: verified ? 'VERIFIED' : 'PENDING_INQUIRY',
        statusMessage: verified ? null : outcome.message,
        isVerified: verified,
        verifiedAt: verified ? new Date() : null,
        isDefault: verified && hasDefault === 0,
        lastInquiryAt: new Date(),
      },
    });

    return {
      result: verified ? 'VERIFIED' : 'PENDING',
      message: outcome.message,
      account: this.presentForUser(account),
    };
  }

  // ── حذف کارت (فقط اگر در هیچ درخواست برداشتی استفاده نشده باشد) ──
  async removeAccount(userId: string, accountId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, userId },
      include: { _count: { select: { withdrawalRequests: true } } },
    });
    if (!account) throw new NotFoundException('کارت بانکی یافت نشد');
    if (account._count.withdrawalRequests > 0) {
      throw new BadRequestException(
        'این کارت در درخواست برداشت استفاده شده و برای حفظ سوابق مالی قابل حذف نیست',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.delete({ where: { id: accountId } });
      if (account.isDefault) await this.assignDefault(tx, userId);
    });
    return { message: 'کارت بانکی حذف شد' };
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

  // ══════════════════════════════════════════
  // ادمین
  // ══════════════════════════════════════════
  async adminList(query: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const search = query.search?.trim();

    const where: Prisma.BankAccountWhereInput = {
      ...(query.status &&
      ['VERIFIED', 'PENDING_INQUIRY', 'REJECTED'].includes(query.status)
        ? { status: query.status as BankAccount['status'] }
        : {}),
      ...(search
        ? {
            OR: [
              { cardNumber: { contains: search } },
              { sheba: { contains: search.toUpperCase() } },
              { ownerName: { contains: search, mode: 'insensitive' } },
              { user: { phone: { contains: search } } },
              { user: { identity: { nationalCode: { contains: search } } } },
              {
                user: {
                  identity: {
                    lastName: { contains: search, mode: 'insensitive' },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total, counts] = await Promise.all([
      this.prisma.bankAccount.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              phone: true,
              identity: {
                select: { firstName: true, lastName: true, nationalCode: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bankAccount.count({ where }),
      this.prisma.bankAccount.groupBy({ by: ['status'], _count: true }),
    ]);

    return {
      data: items.map((a) => ({
        ...this.presentForAdmin(a),
        user: {
          id: a.user.id,
          phone: a.user.phone,
          fullName:
            `${a.user.identity?.firstName ?? ''} ${a.user.identity?.lastName ?? ''}`.trim() ||
            null,
          nationalCode: a.user.identity?.nationalCode ?? null,
        },
      })),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  /** استعلام مجدد کارت توسط ادمین؛ نتیجه‌ی قطعی (تأیید/رد) بلافاصله اعمال می‌شود */
  async adminInquire(accountId: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: accountId },
      include: { user: { include: { identity: true } } },
    });
    if (!account) throw new NotFoundException('کارت بانکی یافت نشد');
    const nationalCode = account.user.identity?.nationalCode;
    if (!nationalCode) {
      throw new BadRequestException(
        'کاربر کد ملی ثبت‌شده ندارد؛ استعلام ممکن نیست',
      );
    }

    const outcome = await this.accountInquiry.inquire(
      account.cardNumber,
      nationalCode,
    );
    const fields = this.inquiryFields(outcome.data, account.cardNumber, account);
    const now = new Date();
    let updated: BankAccount;

    if (outcome.kind === 'VERIFIED') {
      updated = await this.prisma.$transaction(async (tx) => {
        const row = await tx.bankAccount.update({
          where: { id: accountId },
          data: {
            ...fields,
            status: 'VERIFIED',
            statusMessage: null,
            isVerified: true,
            verifiedAt: account.verifiedAt ?? now,
            lastInquiryAt: now,
          },
        });
        if (!account.isDefault) await this.assignDefault(tx, account.userId);
        return tx.bankAccount.findUniqueOrThrow({ where: { id: row.id } });
      });
      if (account.status !== 'VERIFIED') {
        await this.notify(account.userId, 'BANK_ACCOUNT_VERIFIED', account.cardNumber);
      }
    } else if (outcome.kind === 'PENDING') {
      // قطعی سرویس، کارت تأییدشده را از وضعیت تأیید خارج نمی‌کند
      updated = await this.prisma.bankAccount.update({
        where: { id: accountId },
        data: {
          ...fields,
          ...(account.status === 'VERIFIED'
            ? {}
            : { status: 'PENDING_INQUIRY', statusMessage: outcome.message }),
          lastInquiryAt: now,
        },
      });
    } else {
      updated = await this.reject(account, outcome.message, fields);
    }

    return {
      outcome: outcome.kind,
      message:
        outcome.kind === 'PENDING'
          ? `استعلام کامل نشد: ${outcome.message}`
          : outcome.kind === 'VERIFIED'
            ? 'استعلام موفق بود؛ کارت تأیید و شبا تکمیل شد'
            : `کارت رد شد: ${outcome.message}`,
      account: this.presentForAdmin(updated),
    };
  }

  /** تأیید دستی (وقتی وب‌سرویس در دسترس نیست و کارشناس مدارک را بررسی کرده) */
  async adminApprove(
    accountId: string,
    input: { sheba?: string; accountNumber?: string; bankName?: string; ownerName?: string },
  ) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException('کارت بانکی یافت نشد');

    const sheba = input.sheba ? this.normalizeAndValidateSheba(input.sheba) : account.sheba;
    if (!sheba) {
      throw new BadRequestException(
        'شماره شبای این کارت هنوز مشخص نیست؛ برای تأیید دستی شبا را وارد کنید یا استعلام مجدد بگیرید',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: accountId },
        data: {
          sheba,
          accountNumber: input.accountNumber?.trim() || account.accountNumber,
          bankName:
            input.bankName?.trim() ||
            (account.bankName && account.bankName !== 'بانک نامشخص'
              ? account.bankName
              : this.bankInquiry.detectBankBySheba(sheba)),
          ownerName: input.ownerName?.trim() || account.ownerName,
          status: 'VERIFIED',
          statusMessage: null,
          isVerified: true,
          verifiedAt: new Date(),
          inquiryProvider: account.inquiryProvider ?? 'MANUAL',
        },
      });
      if (!account.isDefault) await this.assignDefault(tx, account.userId);
      return tx.bankAccount.findUniqueOrThrow({ where: { id: accountId } });
    });
    if (account.status !== 'VERIFIED') {
      await this.notify(account.userId, 'BANK_ACCOUNT_VERIFIED', account.cardNumber);
    }
    return {
      message: 'کارت بانکی به‌صورت دستی تأیید شد',
      account: this.presentForAdmin(updated),
    };
  }

  async adminReject(accountId: string, reason: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundException('کارت بانکی یافت نشد');
    const updated = await this.reject(account, reason.trim(), {});
    return {
      message: 'کارت بانکی رد شد',
      account: this.presentForAdmin(updated),
    };
  }

  // ══════════════════════════════════════════
  private async reject(
    account: BankAccount,
    reason: string,
    fields: Prisma.BankAccountUpdateInput,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: account.id },
        data: {
          ...fields,
          status: 'REJECTED',
          statusMessage: reason,
          isVerified: false,
          isDefault: false,
          lastInquiryAt: new Date(),
        },
      });
      if (account.isDefault) await this.assignDefault(tx, account.userId);
      return tx.bankAccount.findUniqueOrThrow({ where: { id: account.id } });
    });
    if (account.status !== 'REJECTED') {
      await this.notify(account.userId, 'BANK_ACCOUNT_REJECTED', account.cardNumber, {
        reason,
      });
    }
    return updated;
  }

  /** اگر کاربر حساب پیش‌فرضِ تأییدشده ندارد، جدیدترین حساب تأییدشده پیش‌فرض می‌شود */
  private async assignDefault(tx: Prisma.TransactionClient, userId: string) {
    const hasDefault = await tx.bankAccount.count({
      where: { userId, isDefault: true, isVerified: true },
    });
    if (hasDefault > 0) return;
    const next = await tx.bankAccount.findFirst({
      where: { userId, isVerified: true },
      orderBy: { verifiedAt: 'desc' },
    });
    if (!next) return;
    await tx.bankAccount.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
    await tx.bankAccount.update({
      where: { id: next.id },
      data: { isDefault: true },
    });
  }

  /** فیلدهای حاصل از استعلام؛ مقدار قبلی وقتی استعلام چیزی برنگرداند حفظ می‌شود */
  private inquiryFields(
    data: BankInquiryData,
    cardNumber: string,
    previous?: BankAccount,
  ) {
    return {
      cardOwnerMatched: data.cardOwnerMatched ?? previous?.cardOwnerMatched ?? null,
      sheba: data.sheba ?? previous?.sheba ?? null,
      accountNumber: data.accountNumber ?? previous?.accountNumber ?? '',
      bankName:
        data.bankName ??
        (previous?.bankName && previous.bankName !== 'بانک نامشخص'
          ? previous.bankName
          : this.bankInquiry.detectBankByCard(cardNumber)),
      ownerName: data.ownerName ?? previous?.ownerName ?? null,
      depositStatus: data.depositStatus ?? previous?.depositStatus ?? null,
      inquiryProvider: data.inquiryProvider ?? previous?.inquiryProvider ?? null,
      inquiryTrackId: data.inquiryTrackId ?? previous?.inquiryTrackId ?? null,
    };
  }

  private async notify(
    userId: string,
    key: 'BANK_ACCOUNT_VERIFIED' | 'BANK_ACCOUNT_REJECTED',
    cardNumber: string,
    vars: Record<string, string> = {},
  ) {
    try {
      await this.smsTemplates.sendToUser(
        key,
        userId,
        { cardLast4: cardNumber.slice(-4), ...vars },
        { referenceType: 'BANK_ACCOUNT' },
      );
    } catch (err) {
      this.logger.warn(
        `اطلاع‌رسانی وضعیت کارت بانکی به کاربر ${userId} ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  private normalizeAndValidateSheba(raw: string): string {
    const sheba = normalizeIban(raw);
    if (!/^IR\d{24}$/.test(sheba)) {
      throw new BadRequestException('شماره شبا باید IR و ۲۴ رقم باشد');
    }
    if (!isValidIranIban(sheba)) {
      throw new BadRequestException('شماره شبا معتبر نیست (رقم کنترل نادرست است)');
    }
    return sheba;
  }

  private presentForUser(acc: BankAccount) {
    return {
      id: acc.id,
      bankName: acc.bankName,
      accountNumber: acc.accountNumber
        ? this.maskAccountNumber(acc.accountNumber)
        : null,
      cardNumber: this.bankInquiry.maskCard(acc.cardNumber),
      cardBin: acc.cardNumber.slice(0, 6),
      cardLast4: acc.cardNumber.slice(-4),
      sheba: acc.sheba ? this.maskSheba(acc.sheba) : null,
      ownerName: acc.ownerName,
      depositStatus: acc.depositStatus,
      depositStatusLabel: acc.depositStatus
        ? (DEPOSIT_STATUS_LABELS[acc.depositStatus] ?? null)
        : null,
      status: acc.status,
      statusMessage: acc.statusMessage,
      isVerified: acc.isVerified,
      isDefault: acc.isDefault,
      verifiedAt: acc.verifiedAt,
      createdAt: acc.createdAt,
    };
  }

  private presentForAdmin(acc: BankAccount) {
    return {
      id: acc.id,
      userId: acc.userId,
      bankName: acc.bankName,
      cardNumber: acc.cardNumber,
      sheba: acc.sheba,
      accountNumber: acc.accountNumber || null,
      ownerName: acc.ownerName,
      depositStatus: acc.depositStatus,
      depositStatusLabel: acc.depositStatus
        ? (DEPOSIT_STATUS_LABELS[acc.depositStatus] ?? null)
        : null,
      cardOwnerMatched: acc.cardOwnerMatched,
      status: acc.status,
      statusMessage: acc.statusMessage,
      isVerified: acc.isVerified,
      isDefault: acc.isDefault,
      inquiryProvider: acc.inquiryProvider,
      inquiryTrackId: acc.inquiryTrackId,
      lastInquiryAt: acc.lastInquiryAt,
      verifiedAt: acc.verifiedAt,
      createdAt: acc.createdAt,
    };
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
