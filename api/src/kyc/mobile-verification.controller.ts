import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IsString, Length, Matches, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MobileVerificationService } from './mobile-verification.service';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from '../common/crypto/password.util';
import { LoginThrottleService } from '../common/auth-security/login-throttle.service';
import { AuditService } from '../common/audit/audit.service';

class RequestPhoneChangeDto {
  @IsString()
  @Length(10, 20)
  phone!: string;

  // FTA_TSE_EXT.4.1 — شماره موبایل عامل ورود و بازیابی است؛ تغییر آن با رمز فعلی احراز هویت مجدد می‌شود
  @IsString()
  @MaxLength(256)
  currentPassword!: string;
}

class ConfirmPhoneChangeDto {
  @IsString()
  @Length(10, 20)
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'کد تأیید باید ۶ رقم باشد' })
  code!: string;
}

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

/**
 * تطبیق شاهکار و تغییر شماره موبایل — فقط JwtAuthGuard (نه ActiveUserGuard) چون دقیقاً
 * کاربرِ مسدودشده به‌دلیل عدم تطابق باید به این مسیرها دسترسی داشته باشد.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users/me/mobile-verification')
export class MobileVerificationController {
  constructor(
    private readonly service: MobileVerificationService,
    private readonly prisma: PrismaService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'وضعیت تطبیق شاهکار شماره موبایل' })
  status(@Req() req: AuthenticatedRequest) {
    return this.service.getStatus(req.user.userId);
  }

  @Post('recheck')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @ApiOperation({ summary: 'استعلام مجدد شاهکار با شماره‌ی فعلی' })
  recheck(@Req() req: AuthenticatedRequest) {
    return this.service.recheckByUser(req.user.userId);
  }

  @Post('change-phone/request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'ثبت شماره‌ی جدید: تطبیق شاهکار و ارسال کد پیامکی' })
  async requestChange(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RequestPhoneChangeDto,
  ) {
    await this.requirePassword(req, dto.currentPassword);
    return this.service.requestPhoneChange(req.user.userId, dto.phone, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('change-phone/confirm')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'تأیید کد پیامکی و جایگزینی شماره موبایل' })
  confirmChange(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ConfirmPhoneChangeDto,
  ) {
    return this.service.confirmPhoneChange(
      req.user.userId,
      dto.phone,
      dto.code,
      { ip: req.ip, userAgent: req.headers['user-agent'] },
    );
  }

  /** FTA_TSE_EXT.4.1 — احراز هویت مجدد با رمز فعلی (با محدودسازی تلاش) */
  private async requirePassword(req: AuthenticatedRequest, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) throw new UnauthorizedException();
    const key = `pwconfirm:${user.id}`;
    await this.throttle.assertAllowed('mfa', key, req.ip);
    const check = await verifyPassword(password, user.passwordHash);
    if (!check.valid) {
      await this.throttle.recordFailure('mfa', key, req.ip);
      await this.audit.logUser({
        userId: user.id,
        action: 'user.phone_change_reauth',
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        source: MobileVerificationController.name,
        success: false,
      });
      throw new BadRequestException('رمز عبور فعلی نادرست است');
    }
    await this.throttle.recordSuccess('mfa', key);
  }
}
