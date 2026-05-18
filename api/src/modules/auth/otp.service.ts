import {
  Injectable,
  Inject,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { OtpType, UserOtp } from '@prisma/client';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @Inject('REDIS_CLIENT') private redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  private readonly OTP_EXPIRY_SECONDS = 120; // 2 minutes
  private readonly RATE_LIMIT_SECONDS = 60; // 1 minute between attempts

  private generateOtp(): string {
    return crypto.randomBytes(3).toString('hex');
  }

  private hash(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  private getRedisKey(mobile: string, type: OtpType): string {
    return `otp:${mobile}:${type}`;
  }

  private getRateLimitKey(mobile: string, type: OtpType): string {
    return `rate-limit:${mobile}:${type}`;
  }

  private normalizeMobile(mobile: string): string {
    if (!mobile || typeof mobile !== 'string') {
      throw new BadRequestException('شماره موبایل معتبر نیست');
    }
    mobile = mobile.trim().replace(/\s+/g, '');
    if (mobile.startsWith('09') && mobile.length === 11)
      return '+98' + mobile.slice(1);
    if (mobile.startsWith('989') && mobile.length === 12) return '+' + mobile;
    if (mobile.startsWith('+989') && mobile.length === 13) return mobile;
    throw new BadRequestException('فرمت موبایل اشتباه است');
  }

  async sendOtp(
    mobile: string,
    type: OtpType,
    metadata?: { ip?: string; device?: string; userId?: string },
  ): Promise<void> {
    mobile = this.normalizeMobile(mobile);
    const redisKey = this.getRedisKey(mobile, type);
    const rateLimitKey = this.getRateLimitKey(mobile, type);

    const rateLimited = await this.redis.exists(rateLimitKey);
    if (rateLimited) {
      this.logger.warn(`Rate limit exceeded for ${mobile} (${type})`);
      throw new BadRequestException('لطفاً کمی صبر کنید و دوباره تلاش کنید.');
    }

    const code = this.generateOtp();
    const hashedCode = this.hash(code);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_SECONDS * 1000);

    let otpRecord: UserOtp;
    try {
      otpRecord = await this.prisma.userOtp.create({
        data: {
          mobile,
          code: hashedCode,
          type,
          expiresAt,
          used: false,
          attempts: 0,
          // sentAt: new Date(),
          //ip: metadata?.ip,
          //device: metadata?.device,
          userId: metadata?.userId,
        },
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to create UserOtp record for ${mobile}: ${errorMessage}`,
      );
      throw new Error('خطا در ثبت اطلاعات OTP');
    }

    try {
      await this.redis.set(redisKey, code, 'EX', this.OTP_EXPIRY_SECONDS);
      await this.redis.set(rateLimitKey, '1', 'EX', this.RATE_LIMIT_SECONDS);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(
        `Failed to set OTP in Redis for ${mobile}: ${errorMessage}`,
      );
      await this.prisma.userOtp.update({
        where: { id: otpRecord.id },
        data: { used: true /* failedReason: 'redis_error' */ },
      });
      throw new Error('خطا در ذخیره OTP موقت');
    }

    this.logger.log(`OTP sent to ${mobile} (${type}): ${code} (برای تست)`);
  }

  async verifyOtp(
    mobile: string,
    code: string,
    type: OtpType,
    metadata?: { ip?: string; device?: string; userId?: string },
  ): Promise<UserOtp> {
    mobile = this.normalizeMobile(mobile);
    if (!code) {
      throw new BadRequestException('کد OTP الزامی است');
    }

    const redisKey = this.getRedisKey(mobile, type);
    const storedCode = await this.redis.get(redisKey);
    let isVerified = false;
    // let failedReason: string | null = null;

    if (storedCode === code) {
      isVerified = true;
      await this.redis.del(redisKey);
    } else {
      //failedReason = 'wrong_code';
    }

    const otpRecord = await this.prisma.userOtp.findFirst({
      where: {
        mobile,
        type,
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      this.logger.warn(`No valid OTP record found for ${mobile} (${type})`);
      throw new UnauthorizedException('کد OTP اشتباه یا منقضی شده است');
    }

    if (!isVerified) {
      this.logger.warn(
        `OTP verification failed: code mismatch for ${mobile} (${type})`,
      );
      await this.prisma.userOtp.update({
        where: { id: otpRecord.id },
        data: {
          used: true,
          //failedReason,
          //ip: metadata?.ip,
          //device: metadata?.device,
          userId: metadata?.userId,
        },
      });
      throw new UnauthorizedException('کد OTP اشتباه است');
    }

    // نوع‌دهی دستی برای دسترسی به فیلدهای ip و device (برای جلوگیری از خطای TypeScript در صورت عدم وجود در Prisma Client)

    const updatedRecord = await this.prisma.userOtp.update({
      where: { id: otpRecord.id },
      data: {
        used: true,
        //verifiedAt: new Date(),
        //failedReason: null,
        //ip: metadata?.ip || recordWithFields.ip,
        //device: metadata?.device || recordWithFields.device,
        userId: metadata?.userId || otpRecord.userId,
      },
    });

    this.logger.log(`OTP verified successfully for ${mobile} (${type})`);
    return updatedRecord;
  }
}
