import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import {
  SendOtpDto,
  VerifyOtpDto,
  SetPasswordDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
} from '@arkan-gold/shared';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  ChallengeCodeDto,
  ChallengeTokenDto,
  LoginOtpRequestDto,
} from './dto/mfa.dto';

// تعریف دقیق ساختار user که توسط JwtStrategy اضافه می‌شود
interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  phone: string;
}

interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('send-otp')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Public()
  @Post('verify-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyOtp(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('set-password')
  async setPassword(@Body() dto: SetPasswordDto, @Req() req: Request) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.setPassword(dto, ip, userAgent);
  }

  // FIA_UAU_EXT.2.4: مسیرهای ورود کاربر: رمز ← عامل دوم، یا کد پیامکی (login/otp) ← تأیید کد؛
  // هر دو با login/verify تکمیل و با login/resend کد دوباره ارسال می‌شود.
  @Public()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const ip = req.ip;
    const userAgent = req.headers['user-agent'];
    return this.authService.login(dto, ip, userAgent);
  }

  // ورود با کد پیامکی (بدون رمز و بدون مرحله‌ی برنامه‌ی احراز هویت)؛ تأیید کد از همان login/verify
  @Public()
  @Post('login/otp')
  @Throttle({ default: { limit: 5, ttl: 300000 } })
  async requestLoginOtp(@Body() dto: LoginOtpRequestDto, @Req() req: Request) {
    return this.authService.requestLoginOtp(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Post('login/verify')
  @Throttle({ default: { limit: 10, ttl: 300000 } })
  async verifyLoginMfa(@Body() dto: ChallengeCodeDto, @Req() req: Request) {
    return this.authService.verifyLoginMfa(
      dto.challengeToken,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Post('login/resend')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendLoginOtp(@Body() dto: ChallengeTokenDto) {
    return this.authService.resendLoginOtp(dto.challengeToken);
  }

  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Req() req: Request) {
    return this.authService.forgotPassword(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('verify-reset-otp')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyResetOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    return this.authService.verifyResetOtp(dto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('reset-password/verify-mfa')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyResetMfa(@Body() dto: ChallengeCodeDto, @Req() req: Request) {
    return this.authService.verifyResetMfa(
      dto.challengeToken,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto, @Req() req: Request) {
    return this.authService.resetPassword(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Public()
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(
      req.user.userId,
      req.user.sessionId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@Req() req: AuthenticatedRequest) {
    return this.authService.logoutAll(
      req.user.userId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.authService.changePassword(
      req.user.userId,
      req.user.sessionId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.userId);
  }
}
