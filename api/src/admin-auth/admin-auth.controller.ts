// api/src/admin-auth/admin-auth.controller.ts
import { Controller, Post, Get, Body, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IsString, MinLength } from 'class-validator';
import { AdminAuthService } from './admin-auth.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminPublic } from './decorators/admin-public.decorator';
import { AdminAuthenticatedUser } from './interfaces/admin-jwt-payload.interface';

class AdminLoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}

class AdminRefreshDto {
  @IsString()
  refreshToken!: string;
}
class ChangePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  newPassword!: string;
}

interface AuthenticatedAdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@Controller('admin-auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @AdminPublic()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 900_000 } }) // ۵ تلاش در ۱۵ دقیقه
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.adminAuthService.login(dto, req.ip, req.headers['user-agent']);
  }

  @AdminPublic()
  @Post('refresh')
  async refresh(@Body() dto: AdminRefreshDto) {
    return this.adminAuthService.refreshToken(dto.refreshToken);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('logout')
  async logout(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.logout(req.user.sessionId);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.logoutAll(req.user.adminUserId);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.getMe(req.user.adminUserId);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: AuthenticatedAdminRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.adminAuthService.changeOwnPassword(
      req.user.adminUserId,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
