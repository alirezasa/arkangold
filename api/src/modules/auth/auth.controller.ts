import { Body, Controller, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';

import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

import { AuthService } from './auth.service';
import { UnauthorizedException } from '@nestjs/common';

import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { RegisterPasswordDto } from './dto/register-password.dto';
import { RegisterProfileDto } from './dto/register-profile.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ارسال OTP
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.mobile, dto.type);
  }

  // تایید OTP
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-otp')
  verifyOtp(@Req() req: Request, @Body() dto: VerifyOtpDto) {
    const ip = req.ip;

    return this.authService.verifyOtp(dto.mobile, dto.code, ip);
  }

  // ورود با رمز عبور
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login-password')
  async loginPassword(@Req() req: Request, @Body() dto: LoginPasswordDto) {
    const ip = req.ip;

    return this.authService.loginPassword(dto.mobile, dto.password, ip);
  }

  // ثبت رمز عبور
  @UseGuards(JwtAuthGuard)
  @Post('register-password')
  registerPassword(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: RegisterPasswordDto,
  ) {
    return this.authService.registerPassword(req.user.id, dto.password);
  }

  // ثبت اطلاعات پروفایل
  @UseGuards(JwtAuthGuard)
  @Post('register-profile')
  registerProfile(
    @Req() req: Request & { user: { id: string } },
    @Body() dto: RegisterProfileDto,
  ) {
    return this.authService.registerProfile(req.user.id, dto);
  }

  // خروج
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: Request) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('Token not provided');
    }

    return this.authService.logout(token);
  }
}
