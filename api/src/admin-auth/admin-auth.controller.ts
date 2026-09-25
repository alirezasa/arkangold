// api/src/admin-auth/admin-auth.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
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

class UpdateOwnProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(80)
  fullName?: string;

  // رشته‌ی خالی = حذف شماره موبایل
  @IsOptional()
  @ValidateIf((o: UpdateOwnProfileDto) => !!o.phone)
  @Matches(/^09\d{9}$/, {
    message: 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود',
  })
  phone?: string;
}

class OwnActivityQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  onlyAuth?: boolean;
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
    return this.adminAuthService.logout(
      req.user.adminUserId,
      req.user.sessionId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.logoutAll(
      req.user.adminUserId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('me')
  async getMe(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.getMe(
      req.user.adminUserId,
      req.user.sessionId,
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Patch('me')
  async updateMe(
    @Req() req: AuthenticatedAdminRequest,
    @Body() dto: UpdateOwnProfileDto,
  ) {
    return this.adminAuthService.updateOwnProfile(
      req.user.adminUserId,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('sessions')
  async listSessions(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.listOwnSessions(
      req.user.adminUserId,
      req.user.sessionId,
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Post('sessions/revoke-others')
  async revokeOtherSessions(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.revokeOtherSessions(
      req.user.adminUserId,
      req.user.sessionId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(
    @Req() req: AuthenticatedAdminRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.adminAuthService.revokeOwnSession(
      req.user.adminUserId,
      id,
      req.user.sessionId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Get('activity')
  async myActivity(
    @Req() req: AuthenticatedAdminRequest,
    @Query() query: OwnActivityQueryDto,
  ) {
    return this.adminAuthService.listOwnActivity(req.user.adminUserId, query);
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
      req.ip,
      req.headers['user-agent'],
    );
  }
}
