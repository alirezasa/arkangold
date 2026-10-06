import {
  Injectable,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
  BadRequestException,
  HttpException,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { SubmitIdentityDto } from '@arkan-gold/shared';
import { UpdateLegalProfileDto } from '@arkan-gold/shared';
import { IdentityVerificationService } from '../integrations/services/identity-verification.service';
import { IdentityVerificationResult } from '../integrations/interfaces/identity-verification.interface';
import { ReferralService } from '../referral/referral.service';
import { MobileVerificationService } from '../kyc/mobile-verification.service';
import { AuditService } from '../common/audit/audit.service';
import { maskNationalCode } from '../common/privacy/masking';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private identityVerification: IdentityVerificationService,
    private referralService: ReferralService,
    private mobileVerification: MobileVerificationService,
    private audit: AuditService,
  ) {}

  // ══════════════════════════════════════════
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        wallet: true,
        identity: true,
        legalProfile: true,
        limits: true,
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const identityVerified = user.identity?.status === 'VERIFIED';
    // کاربرانی که هنوز نتیجه‌ی قطعی شاهکار ندارند در پس‌زمینه استعلام می‌شوند
    this.mobileVerification.scheduleAutoCheck({
      id: user.id,
      mobileVerificationStatus: user.mobileVerificationStatus,
      mobileCheckedAt: user.mobileCheckedAt,
      identityVerified,
    });

    return {
      id: user.id,
      phone: user.phone,
      type: user.type,
      status: user.status,
      referralCode: user.referralCode,
      mobileVerification: this.mobileVerification.present(
        user.mobileVerificationStatus,
        user.phone,
        {
          checkedAt: user.mobileCheckedAt,
          verifiedAt: user.mobileVerifiedAt,
          identityVerified,
        },
      ),
      wallet: user.wallet
        ? {
            goldBalanceGrams: String(user.wallet.goldBalanceGrams),
            rialBalance: String(user.wallet.rialBalance),
            cardNumber: user.wallet.cardNumber,
          }
        : null,

      identity: user.identity
        ? {
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            // FDP_ACC_EXT.1.5 — پوشانده به‌صورت پیش‌فرض؛ نمایش کامل با revealIdentity
            nationalCode: maskNationalCode(user.identity.nationalCode),
            birthDate: null,
            masked: true,
            status: user.identity.status,
            verifiedAt: user.identity.verifiedAt,
          }
        : null,
      legalProfile: user.legalProfile ?? null,
      limits: user.limits ?? null,
      createdAt: user.createdAt,
    };
  }

  /**
   * FDP_ACC_EXT.1.5 — نمایش کامل کد ملی و تاریخ تولد فقط با درخواست صریح کاربر («نمایش»)؛
   * هر نمایش در ممیزی ثبت می‌شود
   */
  async revealIdentity(userId: string, ip?: string, userAgent?: string) {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { userId },
      select: { nationalCode: true, birthDate: true },
    });
    if (!identity) throw new NotFoundException('اطلاعات هویتی ثبت نشده است');
    await this.audit.logUser({
      userId,
      action: 'user.identity_revealed',
      entityType: 'user_identity',
      entityId: userId,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      source: UsersService.name,
    });
    return {
      nationalCode: identity.nationalCode,
      birthDate: identity.birthDate,
    };
  }

  // ══════════════════════════════════════════
  // احراز هویت شخصیِ نماینده — اولین مرحله برای کاربر حقوقی، بدون هیچ
  // پیش‌نیازی به‌جز لاگین بودن (JwtStrategy دیگر PENDING_ACTIVATION را بلاک نمی‌کند)
  // ══════════════════════════════════════════
  async submitIdentity(userId: string, dto: SubmitIdentityDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    // اگر قبلاً تایید شده، نمی‌توان دوباره ارسال کرد
    if (user.identity?.status === 'VERIFIED') {
      throw new ConflictException('هویت شما قبلاً تایید شده است');
    }

    // کد ملی به‌صورت Unique روی این جدول است — اگر قبلاً برای حساب کاربری دیگری
    // ثبت شده باشد، ادامه‌دادن باعث خطای دیتابیس (P2002) می‌شود؛ همین‌جا با پیام
    // روشن جلویش را می‌گیریم (و از یک فراخوانی بی‌فایده به Provider هم صرفه‌جویی می‌شود)
    const duplicateNationalCode = await this.prisma.userIdentity.findUnique({
      where: { nationalCode: dto.nationalCode },
    });
    if (duplicateNationalCode && duplicateNationalCode.userId !== userId) {
      throw new BadRequestException(
        'این کد ملی قبلاً برای حساب کاربری دیگری ثبت شده است',
      );
    }

    // استعلام از وب‌سرویس ثبت احوال
    let civilResult: IdentityVerificationResult;
    try {
      civilResult = await this.identityVerification.verifyIdentity({
        nationalCode: dto.nationalCode,
        firstName: dto.firstName,
        lastName: dto.lastName,
        birthDate: dto.birthDate,
      });
    } catch (err) {
      this.logger.error('خطا در ارتباط با وب‌سرویس ثبت احوال', err);
      await this.upsertIdentity(userId, dto, 'MANUAL_REVIEW');
      throw new ServiceUnavailableException(
        'سرویس احراز هویت موقتاً در دسترس نیست. اطلاعات شما ذخیره شد و بعداً بررسی خواهد شد.',
      );
    }

    if (!civilResult.matched) {
      await this.upsertIdentity(userId, dto, 'MANUAL_REVIEW', civilResult);
      return {
        status: 'MANUAL_REVIEW',
        message:
          'اطلاعات وارد شده با سوابق ثبت احوال تطابق کامل ندارد. درخواست شما برای بررسی دستی ثبت شد.',
      };
    }

    const identity = await this.upsertIdentity(
      userId,
      dto,
      'VERIFIED',
      civilResult,
    );
    // پاداش معرفِ این کاربر در صورتی که زمان پرداخت «احراز هویت» تنظیم شده باشد
    await this.referralService.handleReferredUserEvent(
      userId,
      'IDENTITY_VERIFIED',
    );
    // بلافاصله پس از تأیید هویت: تطبیق شاهکار شماره موبایل با کد ملی
    const mobile = await this.mobileVerification.checkUser(userId);
    return {
      status: 'VERIFIED',
      message:
        mobile.status === 'MISMATCH'
          ? 'احراز هویت انجام شد، اما شماره موبایل شما به نام کد ملی‌تان ثبت نشده است. برای استفاده از خدمات، شماره‌ای که به نام خودتان است ثبت کنید'
          : 'احراز هویت با موفقیت انجام شد',
      mobileVerification: {
        status: mobile.status,
        blocked: mobile.status === 'MISMATCH',
        message: mobile.message,
      },
      identity: {
        firstName: identity.firstName,
        lastName: identity.lastName,
        fatherName: identity.fatherName,
        gender: identity.gender,
        status: identity.status,
        verifiedAt: identity.verifiedAt,
      },
    };
  }

  // ══════════════════════════════════════════
  // استعلام مجدد هویت توسط ادمین (دکمه «استعلام مجدد» در بخش کاربران)
  // با همان کد ملی و تاریخ تولد ثبت‌شده، دوباره از وب‌سرویس ثبت احوال استعلام می‌گیرد.
  // - تطابق: اطلاعات رسمی به‌روزرسانی و هویت «تایید» می‌شود
  // - عدم تطابق: هویت تاییدشده خودکار لغو نمی‌شود (تصمیم با ادمین است)؛
  //   هویت تاییدنشده به «بررسی دستی» می‌رود — همان رفتار ثبت هویت توسط کاربر
  // ══════════════════════════════════════════
  async reinquireIdentityByAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const identity = user.identity;
    if (!identity?.nationalCode || !identity.birthDate) {
      throw new BadRequestException(
        'کاربر هنوز کد ملی و تاریخ تولد ثبت نکرده است؛ استعلام ممکن نیست',
      );
    }

    const input: SubmitIdentityDto = {
      nationalCode: identity.nationalCode,
      birthDate: this.toIsoDate(identity.birthDate),
      firstName: identity.firstName ?? '',
      lastName: identity.lastName ?? '',
    };
    const previousStatus = identity.status;

    let civilResult: IdentityVerificationResult;
    try {
      civilResult = await this.identityVerification.verifyIdentity({
        nationalCode: input.nationalCode,
        birthDate: input.birthDate,
        firstName: input.firstName || undefined,
        lastName: input.lastName || undefined,
      });
    } catch (err) {
      this.logger.error('خطا در استعلام مجدد هویت از وب‌سرویس ثبت احوال', err);
      throw new ServiceUnavailableException(
        'سرویس استعلام هویت موقتاً در دسترس نیست. اطلاعات کاربر تغییری نکرد.',
      );
    }

    let updated = identity;
    try {
      if (civilResult.matched) {
        updated = await this.upsertIdentity(
          userId,
          input,
          'VERIFIED',
          civilResult,
        );
      } else if (previousStatus !== 'VERIFIED') {
        updated = await this.upsertIdentity(
          userId,
          input,
          'MANUAL_REVIEW',
          civilResult,
        );
      }
    } catch (err) {
      if (err instanceof HttpException) throw err;
      // استعلام در Provider موفق بوده ولی ذخیره‌ی پاسخ شکست خورده — به‌جای «خطای داخلی
      // سرور» پیام روشن برگردانده می‌شود تا ادمین بداند استعلام انجام شده است
      this.logger.error(
        `ذخیره‌ی نتیجه‌ی استعلام مجدد هویت کاربر ${userId} ناموفق بود: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new UnprocessableEntityException(
        'استعلام از ثبت احوال انجام شد ولی ذخیره‌ی نتیجه ناموفق بود؛ جزئیات در لاگ سرور ثبت شد',
      );
    }

    if (civilResult.matched && previousStatus !== 'VERIFIED') {
      await this.referralService.handleReferredUserEvent(
        userId,
        'IDENTITY_VERIFIED',
      );
      // هویت تازه تأیید شد → تطبیق شاهکار شماره موبایل
      await this.mobileVerification.checkUser(userId);
    }

    return {
      matched: civilResult.matched,
      reason: civilResult.reason ?? null,
      previousStatus,
      status: updated.status,
      provider: civilResult.verifiedByProvider ?? null,
      checkedAt: new Date().toISOString(),
      message: civilResult.matched
        ? 'استعلام انجام شد؛ اطلاعات هویتی کاربر با ثبت احوال تطابق دارد و به‌روزرسانی شد'
        : previousStatus === 'VERIFIED'
          ? 'اطلاعات با ثبت احوال تطابق ندارد. وضعیت «تایید شده» کاربر تغییری نکرد؛ لطفاً بررسی کنید'
          : 'اطلاعات با ثبت احوال تطابق ندارد؛ هویت کاربر در وضعیت «بررسی دستی» قرار گرفت',
      identity: {
        firstName: updated.firstName,
        lastName: updated.lastName,
        nationalCode: updated.nationalCode,
        birthDate: updated.birthDate,
        fatherName: updated.fatherName,
        gender: updated.gender,
        deathStatus: updated.deathStatus,
        status: updated.status,
        verifiedAt: updated.verifiedAt,
        verifiedByProvider: updated.verifiedByProvider,
      },
    };
  }

  /**
   * تاریخ تولد با new Date('yyyy-mm-dd') یعنی نیمه‌شب UTC ذخیره می‌شود؛ اگر رکوردی با
   * ساعت محلی تهران ذخیره شده باشد (مثلاً 20:30 UTC روز قبل) به نزدیک‌ترین روز گرد می‌شود
   * تا یک روز عقب‌تر به ثبت احوال ارسال نشود.
   */
  private toIsoDate(date: Date): string {
    const rounded = new Date(
      Math.round(date.getTime() / 86_400_000) * 86_400_000,
    );
    return rounded.toISOString().slice(0, 10);
  }

  // ══════════════════════════════════════════
  // پرونده هویتی بر اساس داده رسمی ثبت احوال (پاسخ Provider) ساخته می‌شود، نه صرفاً
  // اظهار کاربر؛ اظهار کاربر فقط وقتی fallback است که Provider آن فیلد را برنگردانده.
  private async upsertIdentity(
    userId: string,
    dto: SubmitIdentityDto,
    status: 'VERIFIED' | 'MANUAL_REVIEW' | 'PENDING',
    civilResult?: IdentityVerificationResult,
  ) {
    const data = {
      firstName: civilResult?.firstName ?? dto.firstName,
      lastName: civilResult?.lastName ?? dto.lastName,
      nationalCode: dto.nationalCode,
      birthDate: new Date(dto.birthDate),
      status,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
      fatherName: civilResult?.fatherName ?? null,
      gender: civilResult?.gender ?? null,
      deathStatus: civilResult?.deathStatus ?? null,
      identityNo: civilResult?.identityNo ?? null,
      identitySeri: civilResult?.identitySeri ?? null,
      identitySerial: civilResult?.identitySerial ?? null,
      officeName: civilResult?.officeName ?? null,
      officeCode: civilResult?.officeCode ?? null,
      civilRegistryTrackingCode: civilResult?.civilRegistryTrackingCode ?? null,
      providerRequestId: civilResult?.providerRequestId ?? null,
      verifiedByProvider: civilResult?.verifiedByProvider ?? null,
    };

    try {
      return await this.prisma.userIdentity.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    } catch (err) {
      // Race Condition: بین چک اولیه در submitIdentity و همین Upsert، حساب دیگری
      // با همین کد ملی ثبت شده — همان پیام روشن به‌جای خطای دیتابیس نمایش داده شود
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new BadRequestException(
          'این کد ملی قبلاً برای حساب کاربری دیگری ثبت شده است',
        );
      }
      throw err;
    }
  }

  // ══════════════════════════════════════════
  async getLegalProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        identity: true,
        legalProfile: true,
      },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.type !== 'LEGAL') {
      throw new BadRequestException('این کاربر حقوقی نیست');
    }

    return {
      identity: user.identity
        ? {
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            nationalCode: user.identity.nationalCode,
            birthDate: user.identity.birthDate,
            status: user.identity.status,
            verifiedAt: user.identity.verifiedAt,
          }
        : null,
      legalProfile: user.legalProfile ?? null,
    };
  }

  // ⬅️ برگردوندیم به منطق اصلی: تکمیل پروفایل حقوقی فقط بعد از احراز هویت
  // شخصیِ نماینده مجاز است — چون قراره اطلاعات شرکت با هویت نماینده تطبیق داده شود.
  async updateLegalProfile(userId: string, dto: UpdateLegalProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true, legalProfile: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.type !== 'LEGAL') {
      throw new BadRequestException('این کاربر حقوقی نیست');
    }
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new BadRequestException('ابتدا باید احراز هویت نماینده تکمیل شود');
    }
    if (user.legalProfile?.verified) {
      throw new ConflictException('پروفایل حقوقی شما قبلاً تایید شده است');
    }

    const legalProfile = await this.prisma.legalProfile.upsert({
      where: { userId },
      create: {
        userId,
        companyName: dto.companyName,
        nationalId: dto.nationalId,
        economicCode: dto.economicCode,
        registrationNumber: dto.registrationNumber,
        representativeId: user.identity.id,
        status: 'PENDING',
      },
      update: {
        companyName: dto.companyName,
        nationalId: dto.nationalId,
        economicCode: dto.economicCode,
        registrationNumber: dto.registrationNumber,
        representativeId: user.identity.id,
        status: 'PENDING',
        rejectionReason: null, // ارسال مجدد یعنی وضعیت قبلی پاک می‌شود
      },
    });

    return {
      message: 'اطلاعات شرکت ثبت شد و در انتظار تایید ادمین است',
      legalProfile,
    };
  }

  // ══════════════════════════════════════════
  // (ادمین) تایید نهایی پروفایل حقوقی: بعد از این‌که هم هویت نماینده
  // verified است و هم پروفایل شرکت ثبت شده، ادمین مدارک را با هم تطبیق
  // می‌دهد و اینجا تایید می‌کند → legalProfile.verified=true + user.status=ACTIVE
  // TODO: بعد از ساخت پنل ادمین، پشت گارد نقش ادمین قرار بگیرد.
  // ══════════════════════════════════════════
  async approveLegalProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true, legalProfile: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.type !== 'LEGAL') {
      throw new BadRequestException('این کاربر حقوقی نیست');
    }
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new BadRequestException(
        'هویت نماینده هنوز تایید نشده است؛ ابتدا باید احراز هویت شخصی تکمیل شود',
      );
    }
    if (!user.legalProfile) {
      throw new BadRequestException('اطلاعات حقوقی هنوز ثبت نشده است');
    }
    if (user.legalProfile.verified) {
      throw new ConflictException('پروفایل حقوقی قبلاً تایید شده است');
    }

    const [legalProfile] = await this.prisma.$transaction([
      this.prisma.legalProfile.update({
        where: { userId },
        data: { verified: true, status: 'VERIFIED', rejectionReason: null },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      }),
    ]);

    this.logger.log(
      `[LegalProfile] پروفایل حقوقی کاربر ${userId} تایید و حساب فعال شد`,
    );

    return {
      message: 'پروفایل حقوقی تایید و حساب کاربر فعال شد',
      legalProfile,
    };
  }

  // ── رد پروفایل حقوقی: دو حالت ──
  async rejectLegalProfile(userId: string, reason: string, editable: boolean) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { legalProfile: { include: { documents: true } } },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.legalProfile) {
      throw new BadRequestException('اطلاعات حقوقی هنوز ثبت نشده است');
    }

    if (editable) {
      // ── رد قابل ویرایش: اطلاعات نگه داشته می‌شود، کاربر می‌تواند اصلاح و ارسال مجدد کند ──
      await this.prisma.legalProfile.update({
        where: { userId },
        data: { status: 'REJECTED', rejectionReason: reason, verified: false },
      });
      this.logger.log(
        `[LegalProfile] پروفایل حقوقی کاربر ${userId} رد شد (قابل ویرایش)`,
      );
      return {
        message:
          'درخواست رد شد. کاربر می‌تواند اطلاعات را اصلاح و مجدداً ارسال کند',
        mode: 'editable',
      };
    }

    // ── رد کامل: حذف اطلاعات حقوقی + بازگشت کاربر به حقیقی ──
    const documents = user.legalProfile.documents;
    await this.prisma.$transaction([
      this.prisma.legalProfile.delete({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { type: 'REAL', status: 'ACTIVE' },
      }),
    ]);

    // پاکسازی فایل‌های فیزیکی (best-effort، نباید عملیات اصلی را fail کند)
    for (const doc of documents) {
      fs.unlink(doc.filePath).catch(() => {
        this.logger.warn(`[LegalProfile] حذف فایل ${doc.filePath} ناموفق بود`);
      });
    }

    this.logger.log(
      `[LegalProfile] پروفایل حقوقی کاربر ${userId} کاملاً رد و کاربر به حقیقی تبدیل شد`,
    );
    return {
      message: 'درخواست به‌طور کامل رد شد و حساب کاربر به حقیقی تغییر یافت',
      mode: 'final',
    };
  }

  // ── درخواست ارتقا از حقیقی به حقوقی (از پروفایل کاربر) ──
  async requestLegalUpgrade(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (user.type === 'LEGAL') {
      throw new ConflictException('حساب شما از قبل حقوقی است');
    }
    if (!user.identity || user.identity.status !== 'VERIFIED') {
      throw new BadRequestException(
        'ابتدا باید احراز هویت شخصی خود را تکمیل کنید',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { type: 'LEGAL', status: 'PENDING_ACTIVATION' },
    });

    this.logger.log(
      `[LegalProfile] کاربر ${userId} درخواست ارتقا به حقوقی داد`,
    );
    return {
      message:
        'درخواست تبدیل حساب به حقوقی ثبت شد. لطفاً اطلاعات شرکت را تکمیل کنید',
    };
  }
}
