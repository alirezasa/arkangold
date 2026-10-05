import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IsString, Length, Matches } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MobileVerificationService } from './mobile-verification.service';

class RequestPhoneChangeDto {
  @IsString()
  @Length(10, 20)
  phone!: string;
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
  constructor(private readonly service: MobileVerificationService) {}

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
  requestChange(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RequestPhoneChangeDto,
  ) {
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
}
