import { Controller, Get, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { UsersService } from './users.service';
import { LoginHistoryService } from '../common/auth-security/login-history.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubmitIdentityDto } from '@arkan-gold/shared';
import { UpdateLegalProfileDto } from '@arkan-gold/shared';

interface AuthenticatedRequest extends Request {
  user: { userId: string; phone: string; sessionId: string };
}

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly loginHistory: LoginHistoryService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'پروفایل کاربر جاری' })
  getProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.getProfile(req.user.userId);
  }

  /** FTA_TAH_EXT.1.1 — آخرین ورود موفق پیش از نشست فعلی */
  @Get('me/last-login')
  lastLogin(@Req() req: AuthenticatedRequest) {
    return this.loginHistory.forUser(req.user.userId, req.user.sessionId);
  }

  @Post('me/identity/reveal')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'نمایش کامل کد ملی و تاریخ تولد (با درخواست صریح کاربر)',
  })
  revealIdentity(@Req() req: AuthenticatedRequest) {
    return this.usersService.revealIdentity(
      req.user.userId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('me/identity')
  @ApiOperation({ summary: 'ارسال اطلاعات هویتی و احراز هویت' })
  submitIdentity(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitIdentityDto,
  ) {
    return this.usersService.submitIdentity(req.user.userId, dto);
  }

  @Get('me/legal-profile')
  @ApiOperation({ summary: 'دریافت پروفایل حقوقی' })
  getLegalProfile(@Req() req: AuthenticatedRequest) {
    return this.usersService.getLegalProfile(req.user.userId);
  }

  @Post('me/legal-profile')
  @ApiOperation({ summary: 'ثبت/بروزرسانی اطلاعات شرکت' })
  updateLegalProfile(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateLegalProfileDto,
  ) {
    return this.usersService.updateLegalProfile(req.user.userId, dto);
  }

  @Post('me/request-legal-upgrade')
  requestLegalUpgrade(@Req() req: AuthenticatedRequest) {
    return this.usersService.requestLegalUpgrade(req.user.userId);
  }

  @Post('me/cancel-legal-request')
  @ApiOperation({
    summary: 'انصراف از درخواست حقوقی و بازگشت به حساب حقیقی (پیش از ثبت شرکت)',
  })
  cancelLegalRequest(@Req() req: AuthenticatedRequest) {
    return this.usersService.cancelLegalRequest(req.user.userId);
  }
}
