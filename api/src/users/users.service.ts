import {
  Injectable,
  NotFoundException,
  ConflictException,
  ServiceUnavailableException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import * as fs from 'fs/promises';
import { PrismaService } from '../prisma/prisma.service';
import { CivilRegistryService } from './civil-registry.service';
import { SubmitIdentityDto } from '@arkan-gold/shared';
import { UpdateLegalProfileDto } from '@arkan-gold/shared';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private prisma: PrismaService,
    private civilRegistry: CivilRegistryService,
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

    return {
      id: user.id,
      phone: user.phone,
      type: user.type,
      status: user.status,
      referralCode: user.referralCode,
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
            nationalCode: user.identity.nationalCode,
            birthDate: user.identity.birthDate,
            status: user.identity.status,
            verifiedAt: user.identity.verifiedAt,
          }
        : null,
      legalProfile: user.legalProfile ?? null,
      limits: user.limits ?? null,
      createdAt: user.createdAt,
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

    // استعلام از وب‌سرویس ثبت احوال
    let civilResult: { matched: boolean; reason?: string };
    try {
      civilResult = await this.civilRegistry.verify(
        dto.nationalCode,
        dto.firstName,
        dto.lastName,
        dto.birthDate,
      );
    } catch (err) {
      this.logger.error('خطا در ارتباط با وب‌سرویس ثبت احوال', err);
      await this.upsertIdentity(userId, dto, 'MANUAL_REVIEW');
      throw new ServiceUnavailableException(
        'سرویس احراز هویت موقتاً در دسترس نیست. اطلاعات شما ذخیره شد و بعداً بررسی خواهد شد.',
      );
    }

    if (!civilResult.matched) {
      await this.upsertIdentity(userId, dto, 'MANUAL_REVIEW');
      return {
        status: 'MANUAL_REVIEW',
        message:
          'اطلاعات وارد شده با سوابق ثبت احوال تطابق کامل ندارد. درخواست شما برای بررسی دستی ثبت شد.',
      };
    }

    const identity = await this.upsertIdentity(userId, dto, 'VERIFIED');
    return {
      status: 'VERIFIED',
      message: 'احراز هویت با موفقیت انجام شد',
      identity: {
        firstName: identity.firstName,
        lastName: identity.lastName,
        status: identity.status,
        verifiedAt: identity.verifiedAt,
      },
    };
  }

  // ══════════════════════════════════════════
  private async upsertIdentity(
    userId: string,
    dto: SubmitIdentityDto,
    status: 'VERIFIED' | 'MANUAL_REVIEW' | 'PENDING',
  ) {
    const data = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      nationalCode: dto.nationalCode,
      birthDate: new Date(dto.birthDate),
      status,
      verifiedAt: status === 'VERIFIED' ? new Date() : null,
    };

    return this.prisma.userIdentity.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
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
