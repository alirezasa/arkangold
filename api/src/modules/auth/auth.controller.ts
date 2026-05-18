import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { LoginPasswordDto } from './dto/login-password.dto';
import { RegisterPasswordDto } from './dto/register-password.dto';
import { RegisterProfileDto } from './dto/register-profile.dto';
import { AuthRequest } from '../../types/request-user';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Throttle({ default: { limit: 2, ttl: 60000 } })
  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto.mobile, dto.type);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('verify-otp')
  verifyOtp(@Req() req: AuthRequest, @Body() dto: VerifyOtpDto) {
    const ip = req.ip;
    return this.authService.verifyOtp(dto.mobile, dto.code, dto.type, ip);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login-password')
  loginPassword(@Req() req: AuthRequest, @Body() dto: LoginPasswordDto) {
    const ip = req.ip;
    return this.authService.loginPassword(dto.mobile, dto.password, ip);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register-password')
  registerPassword(@Req() req: AuthRequest, @Body() dto: RegisterPasswordDto) {
    return this.authService.registerPassword(req.user.id, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Post('register-profile')
  registerProfile(@Req() req: AuthRequest, @Body() dto: RegisterProfileDto) {
    return this.authService.registerProfile(req.user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: AuthRequest) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Token not provided');
    return this.authService.logout(token);
  }
}
