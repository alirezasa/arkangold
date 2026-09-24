import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
  Inject,
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
import { hashPassword } from '../common/crypto/password.util';
import { SystemConfigService } from '../system-config/system-config.service';
import { ReferralService } from '../referral/referral.service';
import type { ChangePasswordDto } from './dto/change-password.dto';

const AUDIT_SOURCE = 'AuthService';

const MAX_FAILED_PASSWORD_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const OTP_ATTEMPTS_EXCEEDED_MSG = 'تعداد تلاش‌های مجاز به پایان رسید';

interface RequestContext {
  ip?: string;
  userAgent?: string;
}

// FAU_GEN_EXT.1.4: کد OTP هرگز در لاگ عملیاتی ثبت نمی‌شود؛ فقط برای توسعه‌ی محلی
// با فعال‌سازی صریح OTP_DEBUG_LOG=true و هیچ‌وقت در production.
function isOtpDebugLogEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.OTP_DEBUG_LOG === 'true'
  );
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
  ) {}

  // ═══════════════════════════════════════════
  async sendOtp(dto: SendOtpDto, purpose: OtpPurpose = OtpPurpose.REGISTER) {
    const phone = this.normalizePhone(dto.phone);
    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    const redisKey = `otp:${phone}:${purpose}`;
    await this.redis.setex(redisKey, 180, otpHash);

    await this.prisma.userOtp.create({
      data: {
        phone,
        codeHash: otpHash,
        purpose,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      },
    });

    if (isOtpDebugLogEnabled()) {
      this.logger.debug(`[OTP] ${phone} (${purpose}): ${otp}`);
    }
    return { message: 'کد تایید ارسال شد', expiresIn: 180 };
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
  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const phone = this.normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    const maskedPhone = maskPhone(phone);

    if (!user || !user.passwordHash) {
      await this.auditService.logUser({
        userId: null,
        actorLabel: maskedPhone,
        action: 'auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
      });
      throw new UnauthorizedException('شماره همراه یا رمز عبور نادرست است');
    }
    if (user.status === 'BANNED') {
      await this.auditService.logUser({
        userId: user.id,
        actorLabel: maskedPhone,
        action: 'auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'banned' },
      });
      throw new UnauthorizedException('حساب کاربری شما مسدود شده است');
    }
    if (user.status !== 'ACTIVE') {
      await this.auditService.logUser({
        userId: user.id,
        actorLabel: maskedPhone,
        action: 'auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'not_active' },
      });
      throw new UnauthorizedException('حساب کاربری شما فعال نیست');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000,
      );
      await this.auditService.logUser({
        userId: user.id,
        actorLabel: maskedPhone,
        action: 'auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'locked' },
      });
      throw new ForbiddenException(
        `حساب شما به دلیل تلاش‌های ناموفق مکرر موقتاً قفل شده است. ${minutesLeft} دقیقه دیگر تلاش کنید یا با کد یک‌بارمصرف وارد شوید`,
      );
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      await this.registerFailedPasswordAttempt(user.id, maskedPhone, {
        ip,
        userAgent,
      });
      await this.auditService.logUser({
        userId: user.id,
        actorLabel: maskedPhone,
        action: 'auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'invalid_password' },
      });
      throw new UnauthorizedException('شماره همراه یا رمز عبور نادرست است');
    }

    await this.resetFailedPasswordAttempts(
      user.id,
      user.failedLoginCount,
      user.lockedUntil,
    );
    const tokens = await this.createSession(user.id, user.phone, ip, userAgent);
    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskedPhone,
      action: 'auth.login',
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
  async sendLoginOtp(dto: SendOtpDto) {
    return this.sendOtp(dto, OtpPurpose.LOGIN);
  }

  async verifyLoginOtp(dto: VerifyOtpDto, ip?: string, userAgent?: string) {
    const phone = this.normalizePhone(dto.phone);
    const maskedPhone = maskPhone(phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      await this.auditService.logUser({
        userId: null,
        actorLabel: maskedPhone,
        action: 'auth.login_otp',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
      });
      throw new NotFoundException(
        'کاربری با این شماره یافت نشد. لطفاً ثبت‌نام کنید.',
      );
    }

    await this.validateOtpAudited(
      phone,
      dto.code,
      OtpPurpose.LOGIN,
      'auth.login_otp',
      user.id,
      { ip, userAgent },
    );

    // ورود موفق با عامل «مالکیت شماره همراه»، قفل ناشی از رمز عبور را هم برطرف می‌کند
    await this.resetFailedPasswordAttempts(
      user.id,
      user.failedLoginCount,
      user.lockedUntil,
    );
    const tokens = await this.createSession(user.id, user.phone, ip, userAgent);
    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskedPhone,
      action: 'auth.login_otp',
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
  async forgotPassword(dto: ForgotPasswordDto, ctx: RequestContext = {}) {
    const phone = this.normalizePhone(dto.phone);
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

    if (!user) {
      return { message: 'در صورت وجود حساب کاربری، کد بازیابی ارسال خواهد شد' };
    }

    const otp = this.generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);

    await this.redis.setex(
      `otp:${phone}:${OtpPurpose.RESET_PASSWORD}`,
      180,
      otpHash,
    );
    await this.prisma.userOtp.create({
      data: {
        phone,
        codeHash: otpHash,
        purpose: OtpPurpose.RESET_PASSWORD,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000),
      },
    });

    if (isOtpDebugLogEnabled()) {
      this.logger.debug(`[Reset OTP] ${phone}: ${otp}`);
    }
    return { message: 'در صورت وجود حساب کاربری، کد بازیابی ارسال خواهد شد' };
  }

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

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    await this.auditService.logUser({
      userId: user.id,
      actorLabel: maskPhone(phone),
      action: 'auth.verify_reset_otp',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });

    const resetToken = this.jwtService.sign(
      {
        phone,
        purpose: 'reset_password',
        userId: user.id,
      } as ResetTokenPayload,
      {
        ...jwtSignOptions('JWT_RESET_SECRET'),
        expiresIn: 600,
      },
    );

    return { resetToken, message: 'کد با موفقیت تایید شد' };
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

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.user.update({
      where: { id: payload.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    });
    await this.prisma.userSession.deleteMany({
      where: { userId: payload.userId },
    });

    await this.auditService.logUser({
      userId: payload.userId,
      actorLabel: maskPhone(payload.phone),
      action: 'auth.reset_password',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });

    return { message: 'رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید.' };
  }

  // ═══════════════════════════════════════════
  // تغییر رمز عبور توسط کاربر واردشده — سایر نشست‌ها باطل می‌شوند
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

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) {
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

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException(
        'رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد',
      );
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
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

  private async registerFailedPasswordAttempt(
    userId: string,
    maskedPhone: string | null,
    ctx: RequestContext,
  ) {
    // افزایش اتمیک تا تلاش‌های همزمان (از IPهای مختلف) کم‌شماری نشوند
    const { failedLoginCount: newCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });

    if (newCount >= MAX_FAILED_PASSWORD_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + LOCK_DURATION_MS),
        },
      });
      // FAU_GEN_EXT.1.5 بند ۵: قفل‌شدن حساب به دلیل تلاش‌های ناموفق مکرر
      await this.auditService.logUser({
        userId,
        actorLabel: maskedPhone,
        action: 'auth.account_locked',
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: {
          failedAttempts: newCount,
          lockDurationMs: LOCK_DURATION_MS,
        },
      });
    }
  }

  private async resetFailedPasswordAttempts(
    userId: string,
    currentCount: number,
    lockedUntil: Date | null,
  ) {
    if (currentCount === 0 && !lockedUntil) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
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
    for (let i = 0; i < 8; i++)
      code += chars[crypto.randomInt(chars.length)];
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
