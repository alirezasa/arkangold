import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { maskPhone } from '../common/audit/mask.util';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import {
  SendOtpDto,
  VerifyOtpDto,
  SetPasswordDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from '@arkan-gold/shared';
import { OtpPurpose, UserType } from '../generated/prisma/client';
import {
  jwtSignOptions,
  jwtVerifyOptions,
} from '../common/secrets/jwt-keyring';
import { hashPassword, verifyPassword } from '../common/crypto/password.util';
import { PasswordPolicyService } from '../common/password-policy/password-policy.service';
import { LoginThrottleService } from '../common/auth-security/login-throttle.service';
import { PowCaptchaService } from '../common/auth-security/pow-captcha.service';
import { OtpSendLimiterService } from '../common/auth-security/otp-send-limiter.service';
import { LoginAlertService } from '../common/auth-security/login-alert.service';
import {
  LoginChallenge,
  LoginChallengeService,
} from '../common/auth-security/login-challenge.service';
import { MfaService } from '../common/mfa/mfa.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { ReferralService } from '../referral/referral.service';
import type { ChangePasswordDto } from './dto/change-password.dto';
// FAU_GEN_EXT.1.4: شرط چاپ کد OTP در لاگ (توضیح در همان فایل)
import { isOtpDebugLogEnabled } from '../common/logging/otp-debug';
import { SmsTemplateService } from '../notifications/sms-template.service';

const AUDIT_SOURCE = 'AuthService';

const OTP_ATTEMPTS_EXCEEDED_MSG = 'تعداد تلاش‌های مجاز به پایان رسید';
const OTP_TTL_SECONDS = 180;
// FIA_UAU_EXT.2.7: یک پیام برای شماره‌ی ناموجود، رمز نادرست و حساب بدون رمز
const INVALID_CREDENTIALS_MSG = 'شماره همراه یا رمز عبور نادرست است';
const RESET_SENT_MSG = 'در صورت وجود حساب کاربری، کد بازیابی ارسال خواهد شد';

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

// ── رابط‌های payload توکن‌ها ──
interface TempTokenPayload {
  phone: string;
  purpose: 'register';
  type: UserType;
  companyNationalId?: string;
}

interface ResetTokenPayload {
  phone: string;
  purpose: 'reset_password';
  userId: string;
  /** شناسه‌ی یکتا تا توکن بازیابی فقط یک‌بار قابل استفاده باشد */
  jti?: string;
}

/** پاسخ مرحله‌ی اول ورود: هنوز نشستی صادر نشده و عامل دوم لازم است */
export interface MfaChallengeResponse {
  mfaRequired: true;
  method: 'SMS' | 'TOTP';
  challengeToken: string;
  maskedPhone?: string;
  expiresIn?: number;
  resendAfter?: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    @Inject('REDIS_CLIENT') private redis: Redis,
    private systemConfig: SystemConfigService,
    private referralService: ReferralService,
    private smsTemplates: SmsTemplateService,
    private passwordPolicy: PasswordPolicyService,
    private loginThrottle: LoginThrottleService,
    private captcha: PowCaptchaService,
    private otpLimiter: OtpSendLimiterService,
    private loginAlerts: LoginAlertService,
    private challenges: LoginChallengeService,
    private mfa: MfaService,
  ) {}

  /** ارسال کد یکبارمصرف با قالب پیامک رویداد؛ شکست ارسال به کاربر گزارش می‌شود */
  private async deliverOtp(
    phone: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const key =
      purpose === OtpPurpose.LOGIN
        ? 'AUTH_LOGIN_OTP'
        : purpose === OtpPurpose.RESET_PASSWORD
          ? 'AUTH_RESET_PASSWORD_OTP'
          : purpose === OtpPurpose.CHANGE_PHONE
            ? 'AUTH_CHANGE_PHONE_OTP'
            : 'AUTH_REGISTER_OTP';
    try {
      await this.smsTemplates.send(
        key,
        phone,
        { code },
        { throwOnFailure: true, referenceType: 'AUTH_OTP' },
      );
    } catch (err) {
      this.logger.error(
        `ارسال پیامک کد تأیید به ${maskPhone(phone)} ناموفق بود: ${(err as Error).message}`,
      );
      throw new ServiceUnavailableException(
        'ارسال پیامک کد تأیید ناموفق بود؛ لحظاتی دیگر دوباره تلاش کنید',
      );
    }
  }

  // ═══════════════════════════════════════════
  async sendOtp(dto: SendOtpDto, purpose: OtpPurpose = OtpPurpose.REGISTER) {
    const phone = this.normalizePhone(dto.phone);
    await this.issueOtp(phone, purpose);
    return {
      message: 'کد تایید ارسال شد',
      expiresIn: OTP_TTL_SECONDS,
      resendAfter: 60,
    };
  }

  /**
   * صدور کد یکبارمصرف جدید (CSPRNG، ۶ رقم، ۱۸۰ ثانیه، هش bcrypt با نمک تصادفی).
   * FIA_AUX_EXT.1.2: سهمیه‌ی ارسال هر شماره (۶۰ ثانیه فاصله، ۵ ارسال در ساعت) پیش از ارسال
   * مصرف می‌شود و کدهای قبلی همان هدف باطل می‌شوند تا همیشه فقط یک کد معتبر وجود داشته باشد.
   */
  private async issueOtp(
    phone: string,
    purpose: OtpPurpose,
    opts: { deliver?: boolean } = {},
  ) {
    await this.otpLimiter.consume(phone, purpose);
    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    await this.redis.setex(`otp:${phone}:${purpose}`, OTP_TTL_SECONDS, otpHash);
    await this.redis.del(`otp_attempts:${phone}:${purpose}`);
    await this.prisma.userOtp.deleteMany({ where: { phone, purpose } });
    await this.prisma.userOtp.create({
      data: {
        phone,
        codeHash: otpHash,
        purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      },
    });

    if (isOtpDebugLogEnabled()) {
      this.logger.warn(`[OTP] ${phone} (${purpose}): ${otp}`);
    }
    if (opts.deliver === false) return otp;
    try {
      await this.deliverOtp(phone, purpose, otp);
    } catch (err) {
      // کد ارسال‌نشده نباید معتبر بماند یا سهمیه را مصرف کند
      await this.redis.del(`otp:${phone}:${purpose}`);
      await this.prisma.userOtp.deleteMany({ where: { phone, purpose } });
      await this.otpLimiter.release(phone, purpose);
      throw err;
    }
    return otp;
  }

  // ═══════════════════════════════════════════
  async verifyOtp(dto: VerifyOtpDto, ctx: RequestContext = {}) {
    const phone = this.normalizePhone(dto.phone);

    // ابتدا کد OTP بررسی شود
    await this.validateOtpAudited(
      phone,
      dto.code,
      OtpPurpose.REGISTER,
      'auth.verify_register_otp',
      null,
      ctx,
    );

    // فقط پس از صحیح بودن OTP، وجود کاربر بررسی شود
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });

    if (existingUser) {
      throw new ConflictException(
        'این شماره قبلاً ثبت‌نام کرده است. لطفاً وارد شوید.',
      );
    }

    await this.auditService.logUser({
      userId: null,
      actorLabel: maskPhone(phone),
      action: 'auth.verify_register_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });

    const payload: TempTokenPayload = {
      phone,
      purpose: 'register',
      type: (dto.type as UserType) || UserType.REAL,
    };

    if (dto.type === 'LEGAL' && dto.companyNationalId) {
      payload.companyNationalId = dto.companyNationalId;
    }

    const tempToken = this.jwtService.sign(payload, {
      ...jwtSignOptions('JWT_TEMP_SECRET'),
      expiresIn: 600,
    });

    return {
      tempToken,
      message: 'کد با موفقیت تایید شد',
    };
  }

  // ═══════════════════════════════════════════
  async setPassword(dto: SetPasswordDto, ip?: string, userAgent?: string) {
    let payload: TempTokenPayload;
    try {
      payload = this.jwtService.verify<TempTokenPayload>(
        dto.tempToken,
        jwtVerifyOptions('JWT_TEMP_SECRET', dto.tempToken),
      );
    } catch {
      throw new UnauthorizedException('توکن موقت نامعتبر یا منقضی شده است');
    }

    if (payload.purpose !== 'register') {
      throw new BadRequestException('توکن نامعتبر است');
    }

    const { phone, type, companyNationalId } = payload;

    const alreadyUser = await this.prisma.user.findUnique({
      where: { phone },
    });
    if (alreadyUser) {
      throw new ConflictException('این شماره قبلاً ثبت‌نام کرده است');
    }

    // کد معرف (از لینک دعوت یا ورود دستی)
    let referrerId: string | null = null;
    if (dto.referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: dto.referralCode.trim().toUpperCase() },
      });
      if (!referrer) {
        throw new BadRequestException('کد معرف نامعتبر است');
      }
      referrerId = referrer.id;
    }

    // FIA_UAU_EXT.1: حداقل طول، رمزهای رایج/افشاشده و کلمات مرتبط با برنامه
    await this.passwordPolicy.assertAcceptable(dto.password, 'user', { phone });
    const passwordHash = await hashPassword(dto.password);
    const referralCode = await this.generateReferralCode();
    const cardNumber = await this.generateCardNumber();

    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          phone,
          passwordHash,
          type: type,
          status: type === 'LEGAL' ? 'PENDING_ACTIVATION' : 'ACTIVE',
          referralCode,
          referredById: referrerId,
          passwordChangedAt: new Date(),
        },
      });

      await tx.wallet.create({
        data: {
          userId: newUser.id,
          cardNumber,
        },
      });

      await tx.userLimit.create({
        data: { userId: newUser.id },
      });

      await tx.feeConfig.create({
        data: { userId: newUser.id, type: 'BUY_GOLD', feePercent: 1.0 },
      });
      await tx.feeConfig.create({
        data: { userId: newUser.id, type: 'SELL_GOLD', feePercent: 1.0 },
      });

      await tx.taxConfig.create({
        data: { userId: newUser.id, type: 'BUY', taxPercent: 0.0 },
      });

      // LegalProfile با استفاده از رابطه
      if (type === 'LEGAL' && companyNationalId) {
        await tx.legalProfile.create({
          data: {
            user: { connect: { id: newUser.id } },
            companyName: '',
            nationalId: companyNationalId,
          },
        });
      }

      if (referrerId) {
        await tx.referral.create({
          data: {
            referrerId,
            referredId: newUser.id,
          },
        });
      }

      return newUser;
    });

    // پاداش معرف در صورتی که زمان پرداخت «ثبت‌نام» تنظیم شده باشد (خطا ثبت‌نام را نمی‌شکند)
    if (referrerId) {
      await this.referralService.handleReferredUserEvent(user.id, 'SIGNUP');
    }

    const tokens = await this.createSession(user.id, user.phone, ip, userAgent);
    // ثبت‌نام با دو عامل (مالکیت شماره با کد پیامکی + تعیین رمز) کامل شده؛ اولین دستگاه ثبت می‌شود
    await this.loginAlerts.onSuccessfulLogin(
      { kind: 'user', id: user.id },
      ip,
      userAgent,
    );
    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskPhone(user.phone),
      action: 'auth.register',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        type: user.type,
        status: user.status,
        referralCode: user.referralCode,
      },
    };
  }

  // ═══════════════════════════════════════════
  /**
   * مرحله‌ی اول ورود (عامل دانستنی): رمز عبور.
   * FIA_UAU_EXT.2.3 / FIA_AUX_EXT.1.1: هیچ نشستی با یک عامل صادر نمی‌شود. پس از رمز درست، عامل
   * دوم لازم است: کد برنامه‌ی احراز هویت (اگر کاربر فعال کرده) یا کد پیامکی به شماره‌ای که
   * مالکیت آن هنگام ثبت‌نام اثبات شده است. ورود فقط با پیامک (بدون رمز) حذف شده است.
   */
  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<MfaChallengeResponse> {
    const phone = this.normalizePhone(dto.phone);
    const maskedPhone = maskPhone(phone);

    // FIA_UAU_EXT.2.1: تأخیر فزاینده و بررسی امنیتی برای هر شماره (موجود یا ناموجود، یکسان)
    await this.loginThrottle.assertAllowed('user', phone, ip);
    await this.captcha.enforce(
      await this.loginThrottle.captchaRequired('user', phone, ip, userAgent),
      dto.captcha,
    );

    const user = await this.prisma.user.findUnique({ where: { phone } });
    // FIA_UAU_EXT.2.7: برای شماره‌ی ناموجود هم یک مقایسه‌ی bcrypt انجام می‌شود تا زمان پاسخ یکسان بماند
    const check = await verifyPassword(dto.password, user?.passwordHash);

    if (!user || !check.valid) {
      const result = await this.loginThrottle.recordFailure('user', phone, ip);
      if (user)
        await this.mirrorFailure(user.id, maskedPhone, result, {
          ip,
          userAgent,
        });
      await this.auditService.logUser({
        userId: user?.id ?? null,
        actorLabel: maskedPhone,
        action: 'auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: {
          reason: !user
            ? 'unknown_user'
            : !user.passwordHash
              ? 'no_password'
              : 'invalid_password',
        },
      });
      throw new UnauthorizedException(INVALID_CREDENTIALS_MSG);
    }

    if (check.needsRehash) {
      // ارتقای خودکار هش قدیمی به قالب جدید (پیش‌هش SHA-384 + bcrypt)
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(dto.password) },
      });
    }

    // وضعیت حساب فقط پس از اثبات رمز اعلام می‌شود (عدم افشای وجود حساب به ناشناس)
    if (user.status === 'BANNED' || user.status !== 'ACTIVE') {
      const banned = user.status === 'BANNED';
      await this.auditService.logUser({
        userId: user.id,
        actorLabel: maskedPhone,
        action: 'auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: banned ? 'banned' : 'not_active' },
      });
      throw new ForbiddenException(
        banned ? 'حساب کاربری شما مسدود شده است' : 'حساب کاربری شما فعال نیست',
      );
    }

    const method = user.totpEnabled ? 'TOTP' : 'SMS';
    if (method === 'SMS') {
      await this.issueOtp(phone, OtpPurpose.LOGIN);
    }
    const challengeToken = await this.challenges.create({
      kind: 'user',
      accountId: user.id,
      stage: method === 'TOTP' ? 'TOTP' : 'SMS_OTP',
      via: 'password',
      purpose: 'login',
      identifier: phone,
    });
    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskedPhone,
      action: 'auth.login_first_factor',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
      newValue: { secondFactor: method.toLowerCase() },
    });
    return method === 'TOTP'
      ? { mfaRequired: true, method, challengeToken }
      : {
          mfaRequired: true,
          method,
          challengeToken,
          maskedPhone,
          expiresIn: OTP_TTL_SECONDS,
          resendAfter: 60,
        };
  }

  /** مرحله‌ی دوم ورود: کد پیامکی، کد برنامه‌ی احراز هویت یا یکی از کدهای بازیابی */
  async verifyLoginMfa(
    challengeToken: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    const ch = await this.challenges.get(challengeToken, 'user', [
      'SMS_OTP',
      'TOTP',
    ]);
    if (ch.purpose !== 'login') {
      throw new UnauthorizedException(
        'مرحله‌ی ورود نامعتبر است؛ دوباره وارد شوید',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ch.accountId },
    });
    if (!user)
      throw new UnauthorizedException(
        'مرحله‌ی ورود نامعتبر است؛ دوباره وارد شوید',
      );
    const maskedPhone = maskPhone(user.phone);

    const usedMethod = await this.checkSecondFactor(
      ch,
      challengeToken,
      user,
      code,
      {
        ip,
        userAgent,
        action: 'auth.login_mfa',
      },
    );

    await this.challenges.consume(challengeToken);
    await this.loginThrottle.recordSuccess('user', user.phone);
    await this.loginThrottle.recordSuccess('mfa', `user:${user.id}`);
    if (user.failedLoginCount !== 0 || user.lockedUntil) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
    }
    const tokens = await this.createSession(user.id, user.phone, ip, userAgent);
    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskedPhone,
      action: 'auth.login',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
      newValue: { mfa: usedMethod },
    });
    await this.loginAlerts.onSuccessfulLogin(
      { kind: 'user', id: user.id },
      ip,
      userAgent,
    );
    if (usedMethod === 'recovery_code') {
      await this.loginAlerts.onSecurityChange(
        { kind: 'user', id: user.id },
        'ورود با یکی از کدهای بازیابی انجام شد',
      );
    }
    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone,
        type: user.type,
        status: user.status,
        referralCode: user.referralCode,
      },
    };
  }

  /** ارسال دوباره‌ی کد پیامکی مرحله‌ی دوم (با همان سهمیه‌ی هر شماره) */
  async resendLoginOtp(challengeToken: string) {
    const ch = await this.challenges.get(challengeToken, 'user', ['SMS_OTP']);
    const user = await this.prisma.user.findUnique({
      where: { id: ch.accountId },
    });
    if (!user)
      throw new UnauthorizedException(
        'مرحله‌ی ورود نامعتبر است؛ دوباره وارد شوید',
      );
    const purpose =
      ch.purpose === 'reset' ? OtpPurpose.RESET_PASSWORD : OtpPurpose.LOGIN;
    await this.issueOtp(user.phone, purpose);
    return {
      message: 'کد تایید دوباره ارسال شد',
      expiresIn: OTP_TTL_SECONDS,
      resendAfter: 60,
    };
  }

  /**
   * بررسی عامل دوم یک مرحله (پیامک یا TOTP/کد بازیابی) با شمارش تلاش‌ها؛ در صورت خطا
   * استثنای مناسب پرتاب می‌شود. FIA_UAU_EXT.2.1: تلاش‌های ناموفق عامل دوم برای هر حساب هم
   * تأخیر فزاینده دارند تا ساختن مرحله‌های پیاپی راهی برای حدس کد نباشد.
   */
  private async checkSecondFactor(
    ch: LoginChallenge,
    challengeToken: string,
    user: { id: string; phone: string },
    code: string,
    ctx: { ip?: string; userAgent?: string; action: string },
  ): Promise<'sms' | 'totp' | 'recovery_code'> {
    await this.loginThrottle.assertAllowed('mfa', `user:${user.id}`, ctx.ip);
    let used: 'sms' | 'totp' | 'recovery_code' | null = null;
    let otpError: unknown = null;
    if (ch.stage === 'SMS_OTP') {
      try {
        await this.validateOtp(
          user.phone,
          code,
          ch.purpose === 'reset' ? OtpPurpose.RESET_PASSWORD : OtpPurpose.LOGIN,
        );
        used = 'sms';
      } catch (err) {
        otpError = err;
      }
    } else {
      used = await this.mfa.verify({ kind: 'user', id: user.id }, code);
    }
    if (used) return used;

    const remaining = await this.challenges.fail(challengeToken, ch);
    await this.loginThrottle.recordFailure('mfa', `user:${user.id}`, ctx.ip);
    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskPhone(user.phone),
      action: ctx.action,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: false,
      newValue: {
        reason: ch.stage === 'SMS_OTP' ? 'invalid_otp' : 'invalid_totp',
        remaining,
      },
    });
    if (
      otpError instanceof BadRequestException &&
      otpError.message === OTP_ATTEMPTS_EXCEEDED_MSG
    ) {
      await this.challenges.consume(challengeToken);
      throw new UnauthorizedException(
        'تعداد تلاش‌های مجاز به پایان رسید؛ دوباره وارد شوید',
      );
    }
    throw new UnauthorizedException(
      remaining > 0
        ? `کد وارد شده نادرست یا منقضی است (${remaining.toLocaleString('fa-IR')} تلاش باقی‌مانده)`
        : 'تعداد تلاش‌های مجاز به پایان رسید؛ دوباره وارد شوید',
    );
  }

  /** بازتاب شمارنده‌ی Redis در ستون‌های حساب (برای نمایش در پنل) + رویداد قفل و هشدار */
  private async mirrorFailure(
    userId: string,
    maskedPhone: string,
    result: { failures: number; delaySeconds: number; justThrottled: boolean },
    ctx: RequestContext,
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: result.failures,
        lockedUntil: result.delaySeconds
          ? new Date(Date.now() + result.delaySeconds * 1000)
          : undefined,
      },
    });
    if (result.justThrottled) {
      // FAU_GEN_EXT.1.5 بند ۵: ورود حساب به دوره‌ی تأخیر به دلیل تلاش‌های ناموفق مکرر
      await this.auditService.logUser({
        userId,
        actorLabel: maskedPhone,
        action: 'auth.account_locked',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: {
          failedAttempts: result.failures,
          policy: 'progressive_delay',
        },
      });
      // FIA_UAU_EXT.2.5: اطلاع به صاحب حساب
      await this.loginAlerts.onRepeatedFailures(
        { kind: 'user', id: userId },
        result.failures,
        ctx.ip,
      );
    }
  }

  // ═══════════════════════════════════════════
  /**
   * FIA_UAU_EXT.2.7: پاسخ، کد وضعیت و زمان پاسخ برای شماره‌ی ثبت‌شده و ثبت‌نشده یکسان است:
   * سهمیه‌ی ارسال برای هر دو مصرف می‌شود و ارسال پیامک در پس‌زمینه انجام می‌شود.
   */
  async forgotPassword(dto: ForgotPasswordDto, ctx: RequestContext = {}) {
    const phone = this.normalizePhone(dto.phone);
    await this.otpLimiter.consume(phone, OtpPurpose.RESET_PASSWORD);
    const user = await this.prisma.user.findUnique({ where: { phone } });

    // FAU_GEN_EXT.1.5 بند ۶: ثبت «درخواست» بازنشانی رمز (پاسخ به کلاینت در هر دو حالت یکسان می‌ماند)
    await this.auditService.logUser({
      userId: user?.id ?? null,
      actorLabel: maskPhone(phone),
      action: 'auth.forgot_password',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: !!user,
      newValue: user ? undefined : { reason: 'unknown_user' },
    });

    if (user) {
      void (async () => {
        try {
          // سهمیه همین بالا مصرف شده؛ issueOtp دوباره آن را نمی‌شمارد
          await this.otpLimiter.release(phone, OtpPurpose.RESET_PASSWORD);
          await this.issueOtp(phone, OtpPurpose.RESET_PASSWORD);
        } catch (err) {
          this.logger.error(
            `ارسال کد بازیابی به ${maskPhone(phone)} ناموفق بود: ${(err as Error).message}`,
          );
        }
      })();
    }
    return {
      message: RESET_SENT_MSG,
      expiresIn: OTP_TTL_SECONDS,
      resendAfter: 60,
    };
  }

  /**
   * تأیید کد پیامکی بازیابی. FIA_UID_EXT.1.3: اگر ورود دومرحله‌ای با برنامه‌ی احراز هویت فعال
   * باشد، توکن بازیابی فقط پس از ارائه‌ی کد برنامه (یا کد بازیابی) صادر می‌شود.
   */
  async verifyResetOtp(dto: VerifyOtpDto, ctx: RequestContext = {}) {
    const phone = this.normalizePhone(dto.phone);
    await this.validateOtpAudited(
      phone,
      dto.code,
      OtpPurpose.RESET_PASSWORD,
      'auth.verify_reset_otp',
      null,
      ctx,
    );

    // کد فقط برای شماره‌ی ثبت‌شده صادر می‌شود؛ رسیدن به اینجا یعنی حساب وجود دارد
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user)
      throw new BadRequestException('کد تایید منقضی شده یا نامعتبر است');

    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskPhone(phone),
      action: 'auth.verify_reset_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });

    if (user.totpEnabled) {
      const challengeToken = await this.challenges.create({
        kind: 'user',
        accountId: user.id,
        stage: 'TOTP',
        via: 'password',
        purpose: 'reset',
        identifier: phone,
      });
      return {
        mfaRequired: true as const,
        method: 'TOTP' as const,
        challengeToken,
        message:
          'برای ادامه، کد برنامه‌ی احراز هویت یا یکی از کدهای بازیابی را وارد کنید',
      };
    }
    return {
      resetToken: this.signResetToken(user.id, phone),
      message: 'کد با موفقیت تایید شد',
    };
  }

  /** مرحله‌ی عامل دوم در بازنشانی رمز (فقط برای حساب‌های دارای TOTP) */
  async verifyResetMfa(
    challengeToken: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    const ch = await this.challenges.get(challengeToken, 'user', ['TOTP']);
    if (ch.purpose !== 'reset') {
      throw new UnauthorizedException(
        'مرحله‌ی بازیابی نامعتبر است؛ دوباره تلاش کنید',
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { id: ch.accountId },
    });
    if (!user)
      throw new UnauthorizedException(
        'مرحله‌ی بازیابی نامعتبر است؛ دوباره تلاش کنید',
      );
    await this.checkSecondFactor(ch, challengeToken, user, code, {
      ip,
      userAgent,
      action: 'auth.reset_password_mfa',
    });
    await this.challenges.consume(challengeToken);
    await this.loginThrottle.recordSuccess('mfa', `user:${user.id}`);
    return {
      resetToken: this.signResetToken(user.id, user.phone),
      message: 'هویت شما تأیید شد؛ رمز عبور جدید را تعیین کنید',
    };
  }

  private signResetToken(userId: string, phone: string) {
    return this.jwtService.sign(
      {
        phone,
        purpose: 'reset_password',
        userId,
        jti: uuidv4(),
      } as ResetTokenPayload,
      { ...jwtSignOptions('JWT_RESET_SECRET'), expiresIn: 600 },
    );
  }

  async resetPassword(dto: ResetPasswordDto, ip?: string, userAgent?: string) {
    let payload: ResetTokenPayload;
    try {
      payload = this.jwtService.verify<ResetTokenPayload>(
        dto.resetToken,
        jwtVerifyOptions('JWT_RESET_SECRET', dto.resetToken),
      );
    } catch {
      await this.auditService.logUser({
        userId: null,
        action: 'auth.reset_password',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'invalid_or_expired_reset_token' },
      });
      throw new UnauthorizedException('توکن بازیابی نامعتبر یا منقضی شده است');
    }
    if (payload.purpose !== 'reset_password') {
      await this.auditService.logUser({
        userId: null,
        action: 'auth.reset_password',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'wrong_token_purpose' },
      });
      throw new BadRequestException('توکن نامعتبر است');
    }

    // قواعد رمز پیش از مصرف توکن بررسی می‌شود تا کاربر بتواند رمز دیگری امتحان کند
    await this.passwordPolicy.assertAcceptable(dto.password, 'user', {
      phone: payload.phone,
    });

    // FIA_UAU_EXT.3.1: توکن بازیابی فقط یک‌بار قابل استفاده است
    if (payload.jti) {
      const fresh = await this.redis.set(
        `reset-token-used:${payload.jti}`,
        '1',
        'EX',
        900,
        'NX',
      );
      if (fresh !== 'OK') {
        throw new UnauthorizedException(
          'این لینک/توکن بازیابی قبلاً استفاده شده است',
        );
      }
    }

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.user.update({
      where: { id: payload.userId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    });
    await this.prisma.userSession.deleteMany({
      where: { userId: payload.userId },
    });
    await this.loginThrottle.clear('user', payload.phone);

    await this.auditService.logUser({
      userId: payload.userId,
      actorLabel: maskPhone(payload.phone),
      action: 'auth.reset_password',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    await this.loginAlerts.onSecurityChange(
      { kind: 'user', id: payload.userId },
      'رمز عبور بازنشانی شد و همه‌ی نشست‌ها بسته شدند',
    );

    return { message: 'رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید.' };
  }

  // ═══════════════════════════════════════════
  // تغییر رمز عبور توسط کاربر واردشده — سایر نشست‌ها باطل می‌شوند (FIA_UAU_EXT.1.2 و 1.3)
  async changePassword(
    userId: string,
    sessionId: string,
    dto: ChangePasswordDto,
    ip?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const maskedPhone = maskPhone(user.phone);

    if (!user.passwordHash) {
      throw new BadRequestException(
        'برای حساب شما رمز عبوری ثبت نشده است. از بخش «فراموشی رمز عبور» اقدام کنید',
      );
    }

    await this.loginThrottle.assertAllowed('mfa', `pwchange:${userId}`, ip);
    const current = await verifyPassword(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!current.valid) {
      await this.loginThrottle.recordFailure('mfa', `pwchange:${userId}`, ip);
      await this.auditService.logUser({
        userId,
        actorLabel: maskedPhone,
        action: 'auth.change_password',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'invalid_current_password' },
      });
      throw new BadRequestException('رمز عبور فعلی نادرست است');
    }
    await this.loginThrottle.recordSuccess('mfa', `pwchange:${userId}`);

    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد',
      );
    }
    await this.passwordPolicy.assertAcceptable(dto.newPassword, 'user', {
      phone: user.phone,
    });

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        passwordChangedAt: new Date(),
      },
    });
    await this.prisma.userSession.deleteMany({
      where: { userId, id: { not: sessionId } },
    });

    await this.auditService.logUser({
      userId,
      actorLabel: maskedPhone,
      action: 'auth.change_password',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    await this.loginAlerts.onSecurityChange(
      { kind: 'user', id: userId },
      'رمز عبور تغییر کرد و نشست‌های سایر دستگاه‌ها بسته شدند',
    );

    return {
      message:
        'رمز عبور با موفقیت تغییر کرد. نشست‌های سایر دستگاه‌ها بسته شدند.',
    };
  }

  // ═══════════════════════════════════════════
  async refreshToken(dto: RefreshTokenDto) {
    const hash = crypto
      .createHash('sha256')
      .update(dto.refreshToken)
      .digest('hex');
    const session = await this.prisma.userSession.findFirst({
      where: { refreshTokenHash: hash, expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!session)
      throw new UnauthorizedException('رفرش توکن نامعتبر یا منقضی شده است');

    await this.prisma.userSession.delete({ where: { id: session.id } });
    const tokens = await this.createSession(
      session.userId,
      session.user.phone,
      session.ip ?? undefined,
      session.device ?? undefined,
    );
    return tokens;
  }

  async logout(
    userId: string,
    sessionId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.prisma.userSession
      .delete({ where: { id: sessionId } })
      .catch(() => {});
    await this.auditService.logUser({
      userId,
      action: 'auth.logout',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return { message: 'با موفقیت خارج شدید' };
  }

  async logoutAll(userId: string, ip?: string, userAgent?: string) {
    await this.prisma.userSession.deleteMany({ where: { userId } });
    await this.auditService.logUser({
      userId,
      action: 'auth.logout_all',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return { message: 'از تمام دستگاه‌ها خارج شدید' };
  }

  async getMe(userId: string) {
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
      mfa: {
        totpEnabled: user.totpEnabled,
        recoveryCodesRemaining: user.backupCodesHash.length,
      },
      passwordChangedAt: user.passwordChangedAt,
      wallet: user.wallet
        ? {
            goldBalance: user.wallet.goldBalanceGrams.toString(),
            rialBalance: user.wallet.rialBalance.toString(),
            cardNumber: user.wallet.cardNumber,
          }
        : null,

      identity: user.identity
        ? {
            firstName: user.identity.firstName,
            lastName: user.identity.lastName,
            status: user.identity.status,
          }
        : null,
      legalProfile: user.legalProfile
        ? {
            companyName: user.legalProfile.companyName,
            nationalId: user.legalProfile.nationalId,
            economicCode: user.legalProfile.economicCode,
            registrationNumber: user.legalProfile.registrationNumber,
            verified: user.legalProfile.verified,
          }
        : null,
      limits: user.limits,
      createdAt: user.createdAt,
    };
  }

  // ═══════════════════════════════════════════
  // تغییر شماره موبایل (پس از عدم تطابق شاهکار) — فراخوانی از MobileVerificationService
  // ═══════════════════════════════════════════

  /** ارسال کد یکبارمصرف به شماره‌ی جدید برای اثبات مالکیت آن */
  async sendPhoneChangeOtp(phone: string) {
    return this.sendOtp({ phone }, OtpPurpose.CHANGE_PHONE);
  }

  /** اعتبارسنجی کد شماره‌ی جدید؛ تلاش ناموفق در گزارش فعالیت ثبت می‌شود */
  async verifyPhoneChangeOtp(
    phone: string,
    code: string,
    userId: string,
    ctx: RequestContext = {},
  ) {
    await this.validateOtpAudited(
      this.normalizePhone(phone),
      code,
      OtpPurpose.CHANGE_PHONE,
      'auth.change_phone_otp',
      userId,
      ctx,
    );
  }

  /** نشست تازه با شماره‌ی جدید (توکن‌های قبلی حاوی شماره‌ی قدیمی‌اند و باطل می‌شوند) */
  async issueSessionForUser(
    userId: string,
    phone: string,
    ip?: string,
    device?: string,
  ) {
    return this.createSession(userId, phone, ip, device);
  }

  // ═══════════════════════════════════════════
  // 🔧 متدهای کمکی خصوصی
  // ═══════════════════════════════════════════

  /** اعتبارسنجی OTP همراه با ثبت هر تلاش ناموفق؛ اتمام دفعات مجاز یک سازوکار ضد-خودکارسازی است (FAU_GEN_EXT.1.7) */
  private async validateOtpAudited(
    phone: string,
    code: string,
    purpose: OtpPurpose,
    action: string,
    userId: string | null,
    ctx: RequestContext,
  ) {
    try {
      await this.validateOtp(phone, code, purpose);
    } catch (err) {
      const attemptsExceeded =
        err instanceof BadRequestException &&
        err.message === OTP_ATTEMPTS_EXCEEDED_MSG;
      await this.auditService.logUser({
        userId,
        actorLabel: maskPhone(phone),
        action,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: {
          reason: attemptsExceeded ? 'otp_attempts_exceeded' : 'invalid_otp',
        },
      });
      throw err;
    }
  }

  private async validateOtp(phone: string, code: string, purpose: OtpPurpose) {
    const redisKey = `otp:${phone}:${purpose}`;
    const attemptsKey = `otp_attempts:${phone}:${purpose}`;

    // ۱. Redis
    const otpHashRedis = await this.redis.get(redisKey);
    if (otpHashRedis) {
      const attempts = parseInt((await this.redis.get(attemptsKey)) || '0', 10);
      if (attempts >= 5) {
        await this.redis.del(redisKey);
        await this.redis.del(attemptsKey);
        await this.prisma.userOtp.deleteMany({ where: { phone, purpose } });
        throw new BadRequestException(OTP_ATTEMPTS_EXCEEDED_MSG);
      }

      const valid = await bcrypt.compare(code, otpHashRedis);
      if (!valid) {
        await this.redis.incr(attemptsKey);
        await this.redis.expire(attemptsKey, 180);
        throw new BadRequestException('کد تایید نادرست است');
      }

      await this.redis.del(redisKey);
      await this.redis.del(attemptsKey);
      await this.prisma.userOtp.deleteMany({ where: { phone, purpose } });
      return;
    }

    // ۲. Fallback دیتابیس
    const otpRecord = await this.prisma.userOtp.findFirst({
      where: { phone, purpose, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otpRecord)
      throw new BadRequestException('کد تایید منقضی شده یا نامعتبر است');
    if (otpRecord.attempts >= 5) {
      await this.prisma.userOtp.delete({ where: { id: otpRecord.id } });
      throw new BadRequestException(OTP_ATTEMPTS_EXCEEDED_MSG);
    }

    const valid = await bcrypt.compare(code, otpRecord.codeHash);
    if (!valid) {
      await this.prisma.userOtp.update({
        where: { id: otpRecord.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('کد تایید نادرست است');
    }

    await this.prisma.userOtp.delete({ where: { id: otpRecord.id } });
  }

  private async createSession(
    userId: string,
    phone: string,
    ip?: string,
    device?: string,
  ) {
    const sessionId = uuidv4();
    // عمر نشست از تنظیمات سیستم (session.user.*) — expiresIn پاسخ مبنای maxAge کوکی در BFF است
    const { accessTtlSeconds, refreshTtlSeconds } =
      await this.systemConfig.getSessionPolicy('user');
    const accessToken = this.jwtService.sign(
      { sub: userId, phone, sessionId },
      {
        ...jwtSignOptions('JWT_ACCESS_SECRET'),
        expiresIn: accessTtlSeconds,
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, phone, sessionId },
      {
        ...jwtSignOptions('JWT_REFRESH_SECRET'),
        expiresIn: refreshTtlSeconds,
      },
    );

    const refreshHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const accessHash = crypto
      .createHash('sha256')
      .update(accessToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId,
        device,
        ip,
        refreshTokenHash: refreshHash,
        accessTokenHash: accessHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtlSeconds,
      refreshExpiresIn: refreshTtlSeconds,
    };
  }

  private generateOtp(): string {
    // FCS_RNG_EXT.1.1: مولد امن رمزنگاری (CSPRNG)، نه Math.random
    return crypto.randomInt(100000, 1000000).toString();
  }

  private normalizePhone(phone: string): string {
    let normalized = phone.replace(/[\s\-()]/g, '');
    if (normalized.startsWith('+98'))
      normalized = '0' + normalized.substring(3);
    else if (normalized.startsWith('98'))
      normalized = '0' + normalized.substring(2);
    return normalized;
  }

  private async generateReferralCode(): Promise<string> {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[crypto.randomInt(chars.length)];
    const exists = await this.prisma.user.findUnique({
      where: { referralCode: code },
    });
    return exists ? this.generateReferralCode() : code;
  }

  private async generateCardNumber(): Promise<string> {
    const prefix = '1000';
    let attempts = 0;
    while (attempts < 10) {
      let num = prefix;
      for (let i = 0; i < 12; i++) num += crypto.randomInt(10);
      const exists = await this.prisma.wallet.findUnique({
        where: { cardNumber: num },
      });
      if (!exists) return num;
      attempts++;
    }
    throw new Error('خطا در تولید شماره کارت یکتا');
  }
}
