import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { OtpType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterProfileDto } from './dto/register-profile.dto';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { OtpService } from './otp.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private otpService: OtpService,
  ) {}

  normalizeMobile(mobile: string): string {
    mobile = mobile.trim();
    if (mobile.startsWith('09')) return '+989' + mobile.slice(2);
    if (mobile.startsWith('989')) return '+' + mobile;
    if (mobile.startsWith('+989')) return mobile;
    throw new BadRequestException('فرمت موبایل اشتباه است');
  }

  async sendOtp(mobile: string, type: OtpType) {
    mobile = this.normalizeMobile(mobile);
    await this.otpService.sendOtp(mobile, type);
    return { success: true };
  }

  async verifyOtp(mobile: string, code: string, type: OtpType, ip?: string) {
    mobile = this.normalizeMobile(mobile);
    await this.otpService.verifyOtp(mobile, code, type, { ip });

    let user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user) {
      user = await this.prisma.user.create({
        data: {
          mobile,
          isMobileVerified: true,
          registrationStep: 'OTP_VERIFIED',
        },
      });
    }

    const token = this.jwt.sign({ sub: user.id });
    await this.createSession(user.id, token, ip);
    return { token, registrationStep: user.registrationStep };
  }

  async loginPassword(mobile: string, password: string, ip?: string) {
    mobile = this.normalizeMobile(mobile);
    const user = await this.prisma.user.findUnique({ where: { mobile } });
    if (!user) throw new UnauthorizedException('کاربر یافت نشد');
    if (!user.passwordHash)
      throw new UnauthorizedException('رمز عبور ثبت نشده');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('رمز اشتباه است');

    const token = this.jwt.sign({ sub: user.id });
    await this.createSession(user.id, token, ip);
    return { token };
  }

  async registerPassword(userId: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('کاربر یافت نشد');
    if (user.registrationStep !== 'OTP_VERIFIED') {
      throw new BadRequestException(
        'مرحله ثبت نام برای تنظیم رمز عبور مجاز نیست',
      );
    }
    const hash = await bcrypt.hash(password, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash, registrationStep: 'PASSWORD_SET' },
    });
    return { success: true };
  }

  async registerProfile(userId: string, dto: RegisterProfileDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new BadRequestException('کاربر یافت نشد');
    if (
      user.registrationStep !== 'PASSWORD_SET' &&
      user.registrationStep !== 'OTP_VERIFIED'
    ) {
      throw new BadRequestException(
        'مرحله ثبت نام برای تکمیل پروفایل مجاز نیست',
      );
    }

    await this.prisma.userIdentity.create({
      data: {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        nationalCode: dto.nationalCode,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { registrationStep: 'PROFILE_COMPLETED' },
    });
    return { success: true };
  }

  async logout(token: string) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.userSession.deleteMany({ where: { tokenHash: hash } });
    return { success: true };
  }

  private async createSession(
    userId: string,
    token: string,
    ip?: string,
    device?: string,
  ) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: hash,
        ipAddress: ip,
        device,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
  }
}
