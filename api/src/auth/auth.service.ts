import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
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
    @Inject('REDIS_CLIENT') private redis: Redis,
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

    this.logger.debug(`[OTP] ${phone} (${purpose}): ${otp}`);
    return { message: 'کد تایید ارسال شد', expiresIn: 180 };
  }

  // ═══════════════════════════════════════════
  async verifyOtp(dto: VerifyOtpDto) {
    const phone = this.normalizePhone(dto.phone);
    const existingUser = await this.prisma.user.findUnique({
      where: { phone },
    });
    if (existingUser) {
      throw new ConflictException(
        'این شماره قبلاً ثبت‌نام کرده است. لطفاً وارد شوید.',
      );
    }

    await this.validateOtp(phone, dto.code, OtpPurpose.REGISTER);

    const payload: TempTokenPayload = {
      phone,
      purpose: 'register',
      type: (dto.type as UserType) || UserType.REAL,
    };
    if (dto.type === 'LEGAL' && dto.companyNationalId) {
      payload.companyNationalId = dto.companyNationalId;
    }

    const tempToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_TEMP_SECRET'),
      expiresIn: 600, // 10 دقیقه به ثانیه
    });

    return { tempToken, message: 'کد با موفقیت تایید شد' };
  }

  // ═══════════════════════════════════════════
  async setPassword(dto: SetPasswordDto, ip?: string, userAgent?: string) {
    let payload: TempTokenPayload;
    try {
      payload = this.jwtService.verify<TempTokenPayload>(dto.tempToken, {
        secret: this.configService.get<string>('JWT_TEMP_SECRET'),
      });
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

    // کد معرف
    let referrerId: string | null = null;
    if (dto.referralCode) {
      const referrer = await this.prisma.user.findUnique({
        where: { referralCode: dto.referralCode },
      });
      if (!referrer) {
        throw new BadRequestException('کد معرف نامعتبر است');
      }
      referrerId = referrer.id;
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
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

    const tokens = await this.createSession(user.id, user.phone, ip, userAgent);
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

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('شماره همراه یا رمز عبور نادرست است');
    }
    if (user.status === 'BANNED') {
      throw new UnauthorizedException('حساب کاربری شما مسدود شده است');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('حساب کاربری شما فعال نیست');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('شماره همراه یا رمز عبور نادرست است');
    }

    const tokens = await this.createSession(user.id, user.phone, ip, userAgent);
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
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user)
      throw new NotFoundException(
        'کاربری با این شماره یافت نشد. لطفاً ثبت‌نام کنید.',
      );

    await this.validateOtp(phone, dto.code, OtpPurpose.LOGIN);
    const tokens = await this.createSession(user.id, user.phone, ip, userAgent);
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
  async forgotPassword(dto: ForgotPasswordDto) {
    const phone = this.normalizePhone(dto.phone);
    const user = await this.prisma.user.findUnique({ where: { phone } });
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

    this.logger.debug(`[Reset OTP] ${phone}: ${otp}`);
    return { message: 'در صورت وجود حساب کاربری، کد بازیابی ارسال خواهد شد' };
  }

  async verifyResetOtp(dto: VerifyOtpDto) {
    const phone = this.normalizePhone(dto.phone);
    await this.validateOtp(phone, dto.code, OtpPurpose.RESET_PASSWORD);

    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('کاربر یافت نشد');

    const resetToken = this.jwtService.sign(
      {
        phone,
        purpose: 'reset_password',
        userId: user.id,
      } as ResetTokenPayload,
      {
        secret: this.configService.get<string>('JWT_RESET_SECRET'),
        expiresIn: 600,
      },
    );

    return { resetToken, message: 'کد با موفقیت تایید شد' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: ResetTokenPayload;
    try {
      payload = this.jwtService.verify<ResetTokenPayload>(dto.resetToken, {
        secret: this.configService.get<string>('JWT_RESET_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('توکن بازیابی نامعتبر یا منقضی شده است');
    }
    if (payload.purpose !== 'reset_password') {
      throw new BadRequestException('توکن نامعتبر است');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: payload.userId },
      data: { passwordHash },
    });
    await this.prisma.userSession.deleteMany({
      where: { userId: payload.userId },
    });

    return { message: 'رمز عبور با موفقیت تغییر کرد. لطفاً دوباره وارد شوید.' };
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

  async logout(sessionId: string) {
    await this.prisma.userSession
      .delete({ where: { id: sessionId } })
      .catch(() => {});
    return { message: 'با موفقیت خارج شدید' };
  }

  async logoutAll(userId: string) {
    await this.prisma.userSession.deleteMany({ where: { userId } });
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
        throw new BadRequestException('تعداد تلاش‌های مجاز به پایان رسید');
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
      throw new BadRequestException('تعداد تلاش‌های مجاز به پایان رسید');
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
    const accessToken = this.jwtService.sign(
      { sub: userId, phone, sessionId },
      {
        secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: 1800, // ۱۵ دقیقه به ثانیه
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: userId, phone, sessionId },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: 7 * 24 * 60 * 60, // ۷ روز به ثانیه
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

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

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

    return { accessToken, refreshToken, expiresIn: 900 };
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
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
      code += chars[Math.floor(Math.random() * chars.length)];
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
      for (let i = 0; i < 12; i++) num += Math.floor(Math.random() * 10);
      const exists = await this.prisma.wallet.findUnique({
        where: { cardNumber: num },
      });
      if (!exists) return num;
      attempts++;
    }
    throw new Error('خطا در تولید شماره کارت یکتا');
  }
}
