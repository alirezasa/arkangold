import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../common/audit/audit.service';
import { maskPhone } from '../common/audit/mask.util';
import { MobileNationalIdMatchService } from '../integrations/services/kyc-inquiry.services';
import { ConfigurationError } from '../integrations/errors/integration-error';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import { MobileVerificationStatus } from '../generated/prisma/client';

const AUDIT_SOURCE = 'MobileVerificationService';
/** فاصله‌ی مجاز بین دو استعلام خودکار (بارگذاری پیشخوان) برای کاربری که هنوز نتیجه‌ی قطعی ندارد */
const AUTO_RECHECK_INTERVAL_MS = 30 * 60 * 1000;
/** مهلت تأیید کد پیامکی پس از تطابق شاهکار شماره‌ی جدید */
const PHONE_CHANGE_TTL_SECONDS = 10 * 60;
/** حداکثر تعداد درخواست تغییر شماره در یک ساعت (هر درخواست یک استعلام شاهکار هزینه‌دار است) */
const MAX_PHONE_CHANGE_REQUESTS_PER_HOUR = 5;

interface PendingPhoneChange {
  phone: string;
  trackId: string | null;
  provider: string | null;
}

export interface MobileCheckOutcome {
  status: MobileVerificationStatus;
  /** آیا استعلام واقعاً انجام شد (false: سرویس غیرفعال/پیش‌نیاز ناقص/خطای فنی) */
  checked: boolean;
  message: string;
  provider: string | null;
}

interface RequestCtx {
  ip?: string;
  userAgent?: string;
}

/**
 * تطبیق شاهکار شماره موبایل با کد ملی کاربر:
 * - پس از تأیید احراز هویت (و به‌صورت خودکار برای کاربران قدیمی هنگام ورود به پیشخوان)
 *   شماره‌ی ثبت‌نامی کاربر با کد ملی‌اش تطبیق داده می‌شود.
 * - عدم تطابق → وضعیت MISMATCH: ActiveUserGuard همه‌ی امکانات را می‌بندد تا کاربر شماره‌ای
 *   به نام خودش وارد کند؛ شماره‌ی جدید ابتدا با شاهکار و سپس با کد پیامکی تأیید و جایگزین
 *   شماره‌ی ورود می‌شود.
 * - قطعی وب‌سرویس هرگز کاربر را مسدود نمی‌کند (UNAVAILABLE) و بعداً دوباره بررسی می‌شود؛
 *   شماره‌ی تأییدشده هم با قطعی سرویس از وضعیت تأیید خارج نمی‌شود.
 */
@Injectable()
export class MobileVerificationService {
  private readonly logger = new Logger(MobileVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly shahkar: MobileNationalIdMatchService,
    private readonly authService: AuthService,
    private readonly audit: AuditService,
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
  ) {}

  // ══════════════════════════════════════════
  // وضعیت فعلی (برای صفحه‌ی «تأیید شماره موبایل» اپ)
  // ══════════════════════════════════════════
  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    return this.present(user.mobileVerificationStatus, user.phone, {
      checkedAt: user.mobileCheckedAt,
      verifiedAt: user.mobileVerifiedAt,
      identityVerified: user.identity?.status === 'VERIFIED',
    });
  }

  // ══════════════════════════════════════════
  // استعلام شاهکار شماره‌ی فعلی کاربر و ثبت نتیجه
  // ══════════════════════════════════════════
  async checkUser(userId: string): Promise<MobileCheckOutcome> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const nationalCode = user.identity?.nationalCode;
    if (user.identity?.status !== 'VERIFIED' || !nationalCode) {
      return {
        status: user.mobileVerificationStatus,
        checked: false,
        message: 'تطبیق شماره موبایل پس از تأیید احراز هویت انجام می‌شود',
        provider: null,
      };
    }

    const previous = user.mobileVerificationStatus;
    const now = new Date();

    try {
      const result = await this.shahkar.match({
        mobile: user.phone,
        nationalCode,
      });
      const status: MobileVerificationStatus = result.matched
        ? 'VERIFIED'
        : 'MISMATCH';
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mobileVerificationStatus: status,
          mobileCheckedAt: now,
          mobileVerifiedAt: result.matched ? now : null,
          mobileCheckProvider: result.verifiedByProvider ?? null,
          mobileCheckTrackId: result.providerRequestId ?? null,
        },
      });
      if (status !== previous) {
        await this.audit.logUser({
          userId,
          actorLabel: maskPhone(user.phone),
          action: 'kyc.mobile_shahkar_check',
          source: AUDIT_SOURCE,
          success: result.matched,
          oldValue: { status: previous },
          newValue: { status, provider: result.verifiedByProvider ?? null },
        });
      }
      return {
        status,
        checked: true,
        message: result.matched
          ? 'شماره موبایل با کد ملی شما تطابق دارد'
          : 'شماره موبایل شما به نام کد ملی‌تان ثبت نشده است',
        provider: result.verifiedByProvider ?? null,
      };
    } catch (err) {
      // سرویس شاهکار از پنل ادمین غیرفعال است: بدون تغییر وضعیت (کاربر مسدود نمی‌شود)
      if (err instanceof ConfigurationError) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { mobileCheckedAt: now },
        });
        return {
          status: previous,
          checked: false,
          message: 'استعلام شاهکار در حال حاضر فعال نیست',
          provider: null,
        };
      }

      this.logger.warn(
        `استعلام شاهکار کاربر ${userId} ناموفق بود: ${(err as Error).message}`,
      );
      // قطعی سرویس: شماره‌ی تأییدشده/ناهمخوان همان وضعیت را حفظ می‌کند؛ بقیه UNAVAILABLE
      const status: MobileVerificationStatus =
        previous === 'VERIFIED' || previous === 'MISMATCH'
          ? previous
          : 'UNAVAILABLE';
      await this.prisma.user.update({
        where: { id: userId },
        data: { mobileVerificationStatus: status, mobileCheckedAt: now },
      });
      return {
        status,
        checked: false,
        message:
          'سامانه شاهکار موقتاً در دسترس نیست؛ تطبیق شماره موبایل بعداً به‌صورت خودکار انجام می‌شود',
        provider: null,
      };
    }
  }

  /**
   * استعلام خودکار در پس‌زمینه (هنگام بارگذاری پروفایل) برای کاربرانی که احراز هویتشان
   * تأیید شده ولی هنوز نتیجه‌ی قطعی شاهکار ندارند — مثل کاربران قبل از راه‌اندازی این
   * قابلیت یا زمان قطعی سرویس. هرگز پاسخ پروفایل را معطل یا خراب نمی‌کند.
   */
  scheduleAutoCheck(user: {
    id: string;
    mobileVerificationStatus: MobileVerificationStatus;
    mobileCheckedAt: Date | null;
    identityVerified: boolean;
  }): void {
    if (!user.identityVerified) return;
    if (
      user.mobileVerificationStatus !== 'NOT_CHECKED' &&
      user.mobileVerificationStatus !== 'UNAVAILABLE'
    ) {
      return;
    }
    if (
      user.mobileCheckedAt &&
      Date.now() - user.mobileCheckedAt.getTime() < AUTO_RECHECK_INTERVAL_MS
    ) {
      return;
    }

    const lockKey = `kyc:shahkar:auto:${user.id}`;
    void this.redis
      .set(lockKey, '1', 'EX', 120, 'NX')
      .then((acquired) => (acquired ? this.checkUser(user.id) : null))
      .catch((err: Error) =>
        this.logger.warn(
          `استعلام خودکار شاهکار کاربر ${user.id} ناموفق بود: ${err.message}`,
        ),
      );
  }

  /** استعلام مجدد به درخواست خود کاربر (مثلاً پس از انتقال سیم‌کارت به نام خودش) */
  async recheckByUser(userId: string) {
    const outcome = await this.checkUser(userId);
    const status = await this.getStatus(userId);
    return { ...status, message: outcome.message, checked: outcome.checked };
  }

  // ══════════════════════════════════════════
  // تغییر شماره موبایل: ۱) تطبیق شاهکار شماره‌ی جدید → ۲) ارسال کد پیامکی
  // ══════════════════════════════════════════
  async requestPhoneChange(userId: string, rawPhone: string, ctx: RequestCtx) {
    const phone = normalizeIranMobile(rawPhone);
    if (!phone) {
      throw new BadRequestException(
        'شماره موبایل معتبر نیست؛ ۱۱ رقم و با ۰۹ شروع شود (مثل ۰۹۱۲۱۲۳۴۵۶۷)',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const nationalCode = user.identity?.nationalCode;
    if (user.identity?.status !== 'VERIFIED' || !nationalCode) {
      throw new ForbiddenException(
        'ابتدا احراز هویت خود را تکمیل کنید؛ تغییر شماره پس از تأیید هویت ممکن است',
      );
    }
    if (phone === user.phone) {
      throw new BadRequestException(
        user.mobileVerificationStatus === 'MISMATCH'
          ? 'این همان شماره‌ی فعلی شماست که به نام کد ملی شما ثبت نشده است؛ شماره‌ی دیگری که سیم‌کارت آن به نام خودتان است وارد کنید'
          : 'این شماره هم‌اکنون شماره‌ی حساب شماست',
      );
    }

    const owner = await this.prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (owner && owner.id !== userId) {
      throw new ConflictException(
        'این شماره برای حساب کاربری دیگری ثبت شده است. اگر آن حساب متعلق به شماست، با پشتیبانی تماس بگیرید',
      );
    }

    const rateKey = `kyc:phone_change:rate:${userId}`;
    const attempts = await this.redis.incr(rateKey);
    if (attempts === 1) await this.redis.expire(rateKey, 3600);
    if (attempts > MAX_PHONE_CHANGE_REQUESTS_PER_HOUR) {
      throw new BadRequestException(
        'تعداد درخواست‌های تغییر شماره بیش از حد مجاز است؛ یک ساعت دیگر دوباره تلاش کنید',
      );
    }

    let matched: boolean;
    let trackId: string | null = null;
    let provider: string | null = null;
    try {
      const result = await this.shahkar.match({ mobile: phone, nationalCode });
      matched = result.matched;
      trackId = result.providerRequestId ?? null;
      provider = result.verifiedByProvider ?? null;
    } catch (err) {
      this.logger.warn(
        `استعلام شاهکار شماره‌ی جدید کاربر ${userId} ناموفق بود: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'سامانه شاهکار موقتاً در دسترس نیست و امکان بررسی مالکیت شماره‌ی جدید وجود ندارد. لطفاً دقایقی دیگر دوباره تلاش کنید',
      );
    }

    await this.audit.logUser({
      userId,
      actorLabel: maskPhone(user.phone),
      action: 'kyc.phone_change_shahkar',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: matched,
      newValue: { newPhone: maskPhone(phone), matched, provider },
    });

    if (!matched) {
      throw new UnprocessableEntityException(
        `شماره ${phone} هم به نام کد ملی شما ثبت نشده است. فقط شماره‌ای قابل ثبت است که سیم‌کارت آن به نام خودتان باشد؛ اگر چنین شماره‌ای ندارید، می‌توانید سیم‌کارت را از طریق اپراتور یا دفاتر پیشخوان به نام خود منتقل کنید`,
      );
    }

    await this.authService.sendPhoneChangeOtp(phone);
    const pending: PendingPhoneChange = { phone, trackId, provider };
    await this.redis.setex(
      this.pendingKey(userId),
      PHONE_CHANGE_TTL_SECONDS,
      JSON.stringify(pending),
    );

    return {
      message: `مالکیت شماره تأیید شد؛ کد ۶ رقمی به ${phone} پیامک شد`,
      phone,
      expiresIn: 180,
    };
  }

  // ══════════════════════════════════════════
  // تغییر شماره موبایل: ۳) تأیید کد پیامکی و جایگزینی شماره‌ی ورود
  // ══════════════════════════════════════════
  async confirmPhoneChange(
    userId: string,
    rawPhone: string,
    code: string,
    ctx: RequestCtx,
  ) {
    const phone = normalizeIranMobile(rawPhone);
    const raw = await this.redis.get(this.pendingKey(userId));
    const pending = raw ? (JSON.parse(raw) as PendingPhoneChange) : null;
    if (!phone || !pending || pending.phone !== phone) {
      throw new BadRequestException(
        'درخواست تغییر شماره منقضی شده است؛ لطفاً شماره را دوباره وارد کنید',
      );
    }

    await this.authService.verifyPhoneChangeOtp(phone, code, userId, ctx);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const oldPhone = user.phone;

    const now = new Date();
    try {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: userId },
          data: {
            phone,
            mobileVerificationStatus: 'VERIFIED',
            mobileVerifiedAt: now,
            mobileCheckedAt: now,
            mobileCheckProvider: pending.provider,
            mobileCheckTrackId: pending.trackId,
          },
        }),
        // توکن‌های فعلی شماره‌ی قدیمی را در خود دارند → همه‌ی نشست‌ها باطل و نشست تازه صادر می‌شود
        this.prisma.userSession.deleteMany({ where: { userId } }),
      ]);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        throw new ConflictException(
          'این شماره همین حالا برای حساب کاربری دیگری ثبت شد؛ شماره‌ی دیگری وارد کنید',
        );
      }
      throw err;
    }
    await this.redis.del(this.pendingKey(userId));

    await this.audit.logUser({
      userId,
      actorLabel: maskPhone(phone),
      action: 'kyc.phone_changed',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: true,
      oldValue: { phone: maskPhone(oldPhone) },
      newValue: { phone: maskPhone(phone), provider: pending.provider },
    });

    const tokens = await this.authService.issueSessionForUser(
      userId,
      phone,
      ctx.ip,
      ctx.userAgent,
    );
    return {
      message:
        'شماره موبایل شما با موفقیت تغییر کرد. از این پس با این شماره وارد حساب شوید',
      phone,
      ...tokens,
    };
  }

  // ══════════════════════════════════════════
  // ادمین
  // ══════════════════════════════════════════
  async reinquireByAdmin(userId: string) {
    const outcome = await this.checkUser(userId);
    return {
      ...outcome,
      checkedAt: new Date().toISOString(),
    };
  }

  /** تأیید دستی مالکیت شماره توسط ادمین (مثلاً پس از بررسی مدارک حضوری) */
  async approveByAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mobileVerificationStatus: 'VERIFIED',
        mobileVerifiedAt: now,
        mobileCheckProvider: 'MANUAL',
      },
    });
    return {
      status: 'VERIFIED' as const,
      message: 'مالکیت شماره موبایل کاربر به‌صورت دستی تأیید شد',
    };
  }

  // ══════════════════════════════════════════
  private pendingKey(userId: string) {
    return `kyc:phone_change:pending:${userId}`;
  }

  /** وضعیت + راهنمای قابل نمایش به کاربر */
  present(
    status: MobileVerificationStatus,
    phone: string,
    extra: {
      checkedAt: Date | null;
      verifiedAt: Date | null;
      identityVerified: boolean;
    },
  ) {
    const guidance = MOBILE_GUIDANCE[status];
    return {
      status,
      phone,
      blocked: status === 'MISMATCH',
      identityVerified: extra.identityVerified,
      checkedAt: extra.checkedAt,
      verifiedAt: extra.verifiedAt,
      title: guidance.title,
      description: guidance.description.replace('{phone}', phone),
      steps: guidance.steps,
    };
  }
}

const MOBILE_GUIDANCE: Record<
  MobileVerificationStatus,
  { title: string; description: string; steps: string[] }
> = {
  VERIFIED: {
    title: 'شماره موبایل به نام شما تأیید شده است',
    description:
      'شماره {phone} طبق سامانه شاهکار متعلق به کد ملی شماست و همه‌ی امکانات سامانه فعال است.',
    steps: [],
  },
  MISMATCH: {
    title: 'شماره موبایل به نام شما نیست',
    description:
      'طبق استعلام سامانه شاهکار، سیم‌کارت شماره‌ی {phone} به نام کد ملی شما ثبت نشده است. طبق الزامات قانونی، تا ثبت شماره‌ای که به نام خودتان است امکان استفاده از خدمات (خرید و فروش، کیف پول، برداشت و ...) وجود ندارد.',
    steps: [
      'شماره موبایلی را وارد کنید که سیم‌کارت آن به نام خودتان (با همین کد ملی) ثبت شده باشد.',
      'مالکیت شماره‌ی جدید با سامانه شاهکار بررسی و یک کد ۶ رقمی به آن پیامک می‌شود.',
      'با وارد کردن کد، شماره‌ی جدید جایگزین می‌شود و از این پس با همان شماره وارد حساب می‌شوید.',
      'اگر سیم‌کارتی به نام خودتان ندارید، می‌توانید از طریق اپراتور یا دفاتر پیشخوان سیم‌کارت فعلی را به نام خود منتقل کرده و سپس «استعلام مجدد» را بزنید.',
    ],
  },
  UNAVAILABLE: {
    title: 'تطبیق شماره موبایل در انتظار سامانه شاهکار',
    description:
      'سامانه شاهکار در لحظه‌ی بررسی در دسترس نبود. استفاده از خدمات برای شما آزاد است و تطبیق شماره {phone} بعداً به‌صورت خودکار انجام می‌شود.',
    steps: [],
  },
  NOT_CHECKED: {
    title: 'تطبیق شماره موبایل انجام نشده است',
    description:
      'مالکیت شماره {phone} پس از تأیید احراز هویت با سامانه شاهکار بررسی می‌شود.',
    steps: [],
  },
};
