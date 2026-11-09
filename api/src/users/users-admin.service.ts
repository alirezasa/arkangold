import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CreateAddressDto, UpdateAddressDto } from '@arkan-gold/shared';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, $Enums } from '../generated/prisma/client';
import { ReferralService } from '../referral/referral.service';
import { maskNationalCode } from '../common/privacy/masking';
import { AddressesService } from '../addresses/addresses.service';
import { IRAN_PROVINCES } from '../shipping/iran-provinces';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  SYSTEM_FEE_KEY,
  USER_FEE_TYPES,
  UserFeeType,
  findUserFee,
  signupFeeRows,
} from '../fees/user-fee-override';

type Tx = Prisma.TransactionClient;

export interface AdminCreateUserInput {
  phone: string;
  type: 'REAL' | 'LEGAL';
  firstName?: string;
  lastName?: string;
  companyNationalId?: string;
  sendSms: boolean;
}

export interface AdminUpdateLimitsInput {
  physicalDeliveryMinGrams?: number;
  physicalDeliveryMaxGrams?: number;
}

export interface AdminSetFeeInput {
  type: UserFeeType;
  feePercent: number;
}

/**
 * سقف‌هایی که واقعاً برای هر کاربر اعمال می‌شوند. سقف خرید/فروش/انتقال/برداشت فعلاً از تنظیمات
 * سیستم خوانده می‌شود و ستون‌های متناظر user_limits در محاسبات استفاده نمی‌شوند؛ پس از پنل قابل
 * ویرایش نیستند تا کارشناس به کنترل بی‌اثر اعتماد نکند.
 */
const EDITABLE_LIMIT_FIELDS = [
  'physicalDeliveryMinGrams',
  'physicalDeliveryMaxGrams',
] as const;

const LIMIT_FIELDS = [
  'dailyBuyLimitGrams',
  'dailySellLimitGrams',
  'monthlyWithdrawLimitRial',
  'dailyTransferLimitGrams',
  'physicalDeliveryMinGrams',
  'physicalDeliveryMaxGrams',
] as const;

const cleanName = (v?: string) => v?.trim().replace(/\s+/g, ' ') || null;

interface ListUsersQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
}

@Injectable()
export class UsersAdminService {
  private readonly logger = new Logger(UsersAdminService.name);

  constructor(
    private prisma: PrismaService,
    private referralService: ReferralService,
    private addresses: AddressesService,
    private smsTemplates: SmsTemplateService,
    private systemConfig: SystemConfigService,
  ) {}

  async list(query: ListUsersQuery) {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);

    const where: Prisma.UserWhereInput = {
      ...(query.status ? { status: query.status as $Enums.UserStatus } : {}),
      ...(query.type ? { type: query.type as $Enums.UserType } : {}),
      ...(query.search
        ? {
            OR: [
              { phone: { contains: query.search } },
              {
                identity: {
                  firstName: { contains: query.search, mode: 'insensitive' },
                },
              },
              {
                identity: {
                  lastName: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          identity: {
            select: { firstName: true, lastName: true, status: true },
          },
          wallet: { select: { rialBalance: true, goldBalanceGrams: true } },
          _count: { select: { sentReferrals: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items.map((u) => ({
        id: u.id,
        phone: u.phone,
        type: u.type,
        status: u.status,
        fullName: u.identity
          ? `${u.identity.firstName ?? ''} ${u.identity.lastName ?? ''}`.trim()
          : null,
        identityStatus: u.identity?.status ?? null,
        mobileVerificationStatus: u.mobileVerificationStatus,
        // اصلاح خطا: استفاده از String() برای تبدیل امن Decimal به رشته
        rialBalance: u.wallet ? String(u.wallet.rialBalance) : '0',
        goldBalanceGrams: u.wallet ? String(u.wallet.goldBalanceGrams) : '0',
        // تعداد دوستانی که این کاربر با کد/لینک دعوتش ثبت‌نام کرده‌اند
        referralCount: u._count.sentReferrals,
        createdAt: u.createdAt.toISOString(),
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  async getOne(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        identity: true,
        legalProfile: true,
        wallet: true,
        bankAccounts: true,
        limits: true,
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const [referralStats, referredBy, fees] = await Promise.all([
      this.referralService.statsForReferrer(user.id),
      this.referralService.referrerOf(user.id),
      this.getFees(user.id),
    ]);

    return {
      id: user.id,
      phone: user.phone,
      type: user.type,
      status: user.status,
      referralCode: user.referralCode,
      // وضعیت ورود دومرحله‌ای (بدون هیچ راز یا کد بازیابی)
      mfa: {
        totpEnabled: user.totpEnabled,
        totpEnabledAt: user.totpEnabledAt,
        recoveryCodesRemaining: user.backupCodesHash.length,
      },
      // FDP_ACC_EXT.1.5 / FDP_RIP_EXT.1.3 — فقط فیلدهای لازم؛ کد ملی پوشانده و تاریخ تولد حذف
      // (نمایش کامل با revealIdentity و ثبت در ممیزی)
      identity: user.identity
        ? {
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            nationalCode: maskNationalCode(user.identity.nationalCode),
            birthDate: null,
            hasBirthDate: !!user.identity.birthDate,
            masked: true,
            fatherName: user.identity.fatherName,
            gender: user.identity.gender,
            deathStatus: user.identity.deathStatus,
            status: user.identity.status,
            verifiedAt: user.identity.verifiedAt,
            verifiedByProvider: user.identity.verifiedByProvider,
          }
        : null,
      legalProfile: user.legalProfile,
      wallet: user.wallet
        ? {
            // اصلاح خطا: تبدیل امن Decimal
            rialBalance: String(user.wallet.rialBalance),
            goldBalanceGrams: String(user.wallet.goldBalanceGrams),
            cardNumber: user.wallet.cardNumber,
          }
        : null,
      mobileVerification: {
        status: user.mobileVerificationStatus,
        checkedAt: user.mobileCheckedAt,
        verifiedAt: user.mobileVerifiedAt,
        provider: user.mobileCheckProvider,
        trackId: user.mobileCheckTrackId,
      },
      bankAccounts: user.bankAccounts.map((b) => ({
        id: b.id,
        bankName: b.bankName,
        cardNumber: b.cardNumber,
        sheba: b.sheba,
        accountNumber: b.accountNumber || null,
        ownerName: b.ownerName,
        depositStatus: b.depositStatus,
        status: b.status,
        statusMessage: b.statusMessage,
        isVerified: b.isVerified,
        isDefault: b.isDefault,
        lastInquiryAt: b.lastInquiryAt,
        createdAt: b.createdAt,
      })),
      limits: user.limits
        ? Object.fromEntries(
            LIMIT_FIELDS.map((f) => [f, String(user.limits[f])]),
          )
        : null,
      fees,
      referralStats,
      referredBy,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /** نمایش کامل کد ملی و تاریخ تولد کاربر برای کارشناس (با درخواست صریح؛ ممیزی در کنترلر) */
  async revealIdentity(userId: string) {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { userId },
      select: { nationalCode: true, birthDate: true },
    });
    if (!identity) throw new NotFoundException('اطلاعات هویتی ثبت نشده است');
    return identity;
  }

  async setStatus(userId: string, status: 'ACTIVE' | 'BANNED' | 'INACTIVE') {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    await this.prisma.user.update({ where: { id: userId }, data: { status } });

    if (status === 'BANNED') {
      await this.prisma.userSession.deleteMany({ where: { userId } });
    }

    return { message: 'وضعیت کاربر بروزرسانی شد', status };
  }

  // ═══════════════════════════ تعریف کاربر جدید از پنل ═══════════════════════════

  /**
   * حساب با همان ساختار ثبت‌نام عادی ساخته می‌شود (کیف پول، سقف‌ها، کارمزد و مالیات پیش‌فرض) اما
   * بدون رمز عبور: کاربر با «فراموشی رمز عبور» (کد پیامکی به همین شماره) رمز خود را تعیین می‌کند،
   * پس مالکیت شماره همچنان توسط خود کاربر اثبات می‌شود.
   */
  async createUser(input: AdminCreateUserInput) {
    const phone = normalizeIranMobile(input.phone);
    if (!phone) {
      throw new BadRequestException(
        'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود',
      );
    }
    if (
      input.type === 'LEGAL' &&
      !/^\d{11}$/.test(input.companyNationalId ?? '')
    ) {
      throw new BadRequestException('شناسه ملی شرکت باید ۱۱ رقم باشد');
    }
    const exists = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException(
        'کاربری با این شماره موبایل قبلاً ثبت شده است',
      );
    }
    if (input.type === 'LEGAL') {
      const company = await this.prisma.legalProfile.findFirst({
        where: { nationalId: input.companyNationalId },
        select: { userId: true },
      });
      if (company) {
        throw new ConflictException(
          'این شناسه ملی شرکت قبلاً برای حساب دیگری ثبت شده است',
        );
      }
    }

    // کارمزد خرید/فروش = نرخ همین لحظه‌ی تنظیمات سیستم (مثل ثبت‌نام عادی)
    const feeRows = await signupFeeRows(this.systemConfig);
    const firstName = cleanName(input.firstName);
    const lastName = cleanName(input.lastName);

    let user: {
      id: string;
      phone: string;
      type: $Enums.UserType;
      status: $Enums.UserStatus;
    };
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            phone,
            type: input.type,
            status: input.type === 'LEGAL' ? 'PENDING_ACTIVATION' : 'ACTIVE',
            referralCode: await this.uniqueReferralCode(tx),
          },
          select: { id: true, phone: true, type: true, status: true },
        });
        await tx.wallet.create({
          data: {
            userId: created.id,
            cardNumber: await this.uniqueCardNumber(tx),
          },
        });
        await tx.userLimit.create({ data: { userId: created.id } });
        await tx.feeConfig.createMany({
          data: feeRows.map((r) => ({ ...r, userId: created.id })),
        });
        await tx.taxConfig.create({
          data: { userId: created.id, type: 'BUY', taxPercent: 0.0 },
        });
        // نام فقط برای نمایش/خطاب است؛ احراز هویت (کد ملی + ثبت احوال) را خود کاربر در اپ انجام می‌دهد
        if (firstName || lastName) {
          await tx.userIdentity.create({
            data: {
              userId: created.id,
              firstName,
              lastName,
              status: 'PENDING',
            },
          });
        }
        if (input.type === 'LEGAL') {
          await tx.legalProfile.create({
            data: {
              user: { connect: { id: created.id } },
              companyName: '',
              nationalId: input.companyNationalId,
            },
          });
        }
        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('کاربری با این مشخصات قبلاً ثبت شده است');
      }
      throw err;
    }

    let sms: { status: string; error?: string } | null = null;
    if (input.sendSms) {
      const res = await this.smsTemplates.sendToUser(
        'USER_CREATED_BY_ADMIN',
        user.id,
        { phone: user.phone, appUrl: this.appUrl() },
        { referenceType: 'USER', referenceId: user.id },
      );
      sms = { status: res.status, ...(res.error ? { error: res.error } : {}) };
    }

    return {
      message:
        sms && sms.status !== 'SENT' && sms.status !== 'DRY_RUN'
          ? `کاربر ایجاد شد، اما پیامک ارسال نشد${sms.error ? ` (${sms.error})` : ''}`
          : 'کاربر با موفقیت ایجاد شد',
      id: user.id,
      phone: user.phone,
      type: user.type,
      status: user.status,
      sms,
    };
  }

  /** نشانی اپ برای پیامک خوش‌آمد (بدون پروتکل، کوتاه‌تر و خواناتر در پیامک) */
  private appUrl() {
    const url =
      process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.NODE_ENV === 'production'
        ? 'https://app.arkan.gold'
        : 'http://localhost:3000');
    return url.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  }

  private async uniqueReferralCode(tx: Tx): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let attempt = 0; attempt < 10; attempt++) {
      let code = '';
      for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
      const exists = await tx.user.findUnique({
        where: { referralCode: code },
      });
      if (!exists) return code;
    }
    throw new ConflictException('تولید کد معرف یکتا ناموفق بود');
  }

  private async uniqueCardNumber(tx: Tx): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      let num = '1000';
      for (let i = 0; i < 12; i++) num += crypto.randomInt(10);
      const exists = await tx.wallet.findUnique({ where: { cardNumber: num } });
      if (!exists) return num;
    }
    throw new ConflictException('تولید شماره کارت یکتا ناموفق بود');
  }

  // ═══════════════════════════ نام نمایشی ═══════════════════════════

  /** ویرایش نام فقط تا پیش از تأیید هویت؛ نام تأییدشده از ثبت احوال آمده و دستی تغییر نمی‌کند */
  async updateName(userId: string, firstName?: string, lastName?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.identity?.status === 'VERIFIED') {
      throw new ConflictException(
        'هویت این کاربر از ثبت احوال تأیید شده و نام او قابل ویرایش دستی نیست',
      );
    }
    const data = {
      firstName: cleanName(firstName),
      lastName: cleanName(lastName),
    };
    await this.prisma.userIdentity.upsert({
      where: { userId },
      create: { userId, ...data, status: 'PENDING' },
      update: data,
    });
    return {
      message: 'نام کاربر بروزرسانی شد',
      previous: {
        firstName: user.identity?.firstName ?? null,
        lastName: user.identity?.lastName ?? null,
      },
      ...data,
    };
  }

  // ═══════════════════════════ آدرس‌ها ═══════════════════════════

  private async assertUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
  }

  async listAddresses(userId: string) {
    await this.assertUser(userId);
    return {
      data: await this.addresses.list(userId),
      provinces: IRAN_PROVINCES,
    };
  }

  async createAddress(userId: string, dto: CreateAddressDto) {
    await this.assertUser(userId);
    return this.addresses.create(userId, dto);
  }

  async updateAddress(
    userId: string,
    addressId: string,
    dto: UpdateAddressDto,
  ) {
    return this.addresses.update(userId, addressId, dto);
  }

  async setDefaultAddress(userId: string, addressId: string) {
    return this.addresses.setDefault(userId, addressId);
  }

  async removeAddress(userId: string, addressId: string) {
    return this.addresses.remove(userId, addressId);
  }

  // ═══════════════════════════ سقف‌های معاملاتی ═══════════════════════════

  async updateLimits(userId: string, input: AdminUpdateLimitsInput) {
    await this.assertUser(userId);
    const data: Partial<
      Record<(typeof EDITABLE_LIMIT_FIELDS)[number], number>
    > = {};
    for (const f of EDITABLE_LIMIT_FIELDS) {
      const v = input[f];
      if (v === undefined || v === null) continue;
      if (!Number.isFinite(v) || v < 0) {
        throw new BadRequestException('مقدار سقف باید عددی نامنفی باشد');
      }
      data[f] = v;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('هیچ مقداری برای تغییر ارسال نشده است');
    }

    const current = await this.prisma.userLimit.findUnique({
      where: { userId },
    });
    const min =
      data.physicalDeliveryMinGrams ??
      Number(current?.physicalDeliveryMinGrams ?? 1);
    const max =
      data.physicalDeliveryMaxGrams ??
      Number(current?.physicalDeliveryMaxGrams ?? 500);
    if (min > max) {
      throw new BadRequestException(
        'حداقل تحویل فیزیکی نمی‌تواند از حداکثر آن بیشتر باشد',
      );
    }

    const updated = await this.prisma.userLimit.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    const view = (row: typeof updated | null) =>
      row
        ? Object.fromEntries(LIMIT_FIELDS.map((f) => [f, String(row[f])]))
        : null;
    return {
      message: 'سقف‌های کاربر بروزرسانی شد',
      previous: view(current),
      limits: view(updated),
    };
  }

  // ═══════════════════════════ کارمزد خرید/فروش کاربر ═══════════════════════════

  /** کارمزد فعلی کاربر (آخرین تغییر) و نرخ فعلی تنظیمات سیستم برای خرید و فروش طلا */
  async getFees(userId: string) {
    const [system, rows] = await Promise.all([
      Promise.all(
        USER_FEE_TYPES.map((t) =>
          this.systemConfig.getDecimal(SYSTEM_FEE_KEY[t], '1.0'),
        ),
      ),
      Promise.all(
        USER_FEE_TYPES.map((t) => findUserFee(this.prisma, userId, t)),
      ),
    ]);
    return USER_FEE_TYPES.map((type, i) => ({
      type,
      feePercent: (rows[i]?.feePercent ?? system[i]).toString(),
      /** USER = ذخیره‌شده برای کاربر؛ SYSTEM = ردیفی ندارد و نرخ فعلی تنظیمات اعمال می‌شود */
      source: rows[i] ? ('USER' as const) : ('SYSTEM' as const),
      updatedAt: rows[i]?.updatedAt ?? null,
      systemFeePercent: system[i].toString(),
    }));
  }

  /**
   * تغییر کارمزد خرید/فروش کاربر. ردیف‌های قبلی همان نوع جایگزین می‌شوند تا معامله همیشه با آخرین
   * تغییر محاسبه شود. پیش‌فاکتورهای (قفل قیمت) صادرشده با نرخ قبلی معتبر می‌مانند.
   */
  async setFee(userId: string, input: AdminSetFeeInput) {
    await this.assertUser(userId);
    const percent = input.feePercent;
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new BadRequestException('درصد کارمزد باید بین ۰ تا ۱۰۰ باشد');
    }
    if (Math.abs(Math.round(percent * 100) - percent * 100) > 1e-9) {
      throw new BadRequestException('درصد کارمزد حداکثر ۲ رقم اعشار دارد');
    }
    const previous = await findUserFee(this.prisma, userId, input.type);

    await this.prisma.$transaction([
      this.prisma.feeConfig.deleteMany({ where: { userId, type: input.type } }),
      this.prisma.feeConfig.create({
        data: { userId, type: input.type, feePercent: percent, isActive: true },
      }),
    ]);
    return {
      message: 'کارمزد کاربر بروزرسانی شد',
      type: input.type,
      previousFeePercent: previous ? previous.feePercent.toString() : null,
      feePercent: String(percent),
    };
  }
}
