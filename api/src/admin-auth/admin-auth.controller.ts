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
  IsIn,
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
import { AdminAuthService, AdminLoginPortal } from './admin-auth.service';
import { AgentOtpLoginService } from './agent-otp-login.service';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard';
import { AdminPublic } from './decorators/admin-public.decorator';
import { AdminAuthenticatedUser } from './interfaces/admin-jwt-payload.interface';

class AdminLoginDto {
  @IsString()
  @MaxLength(100)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;

  // درگاه ورود (از روی دامنه در BFF پنل تعیین می‌شود؛ خالی = پنل مدیریت)
  @IsOptional()
  @IsIn(['admin', 'agent'])
  portal?: AdminLoginPortal;

  // راه‌حل «بررسی امنیتی» وقتی سرور CAPTCHA_REQUIRED برگرداند
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  captcha?: string;
}

class LoginStepDto {
  @IsString()
  @MaxLength(100)
  challengeToken!: string;
}

class LoginStepCodeDto extends LoginStepDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

class LoginStepPasswordDto extends LoginStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
  newPassword!: string;
}

class MfaCodeDto {
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

class AgentOtpRequestDto {
  @IsString()
  @MaxLength(20)
  phone!: string;
}

class AgentOtpVerifyDto {
  @IsString()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @MaxLength(12)
  code!: string;
}

class AdminRefreshDto {
  @IsString()
  refreshToken!: string;
}
class ChangePasswordDto {
  @IsString()
  @MaxLength(256)
  currentPassword!: string;

  // حداقل طول و سایر قواعد در سیاست واحد رمز عبور بررسی می‌شود (بدون قاعده‌ی ترکیب کاراکتر)
  @IsString()
  @MinLength(1)
  @MaxLength(128, { message: 'رمز عبور حداکثر ۱۲۸ کاراکتر است' })
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
  constructor(
    private readonly adminAuthService: AdminAuthService,
    private readonly agentOtpLogin: AgentOtpLoginService,
  ) {}

  // FIA_UAU_EXT.2.4: مسیرهای ورود پنل فقط این‌ها هستند: login (رمز) یا agent-otp (کد پیامکی نماینده)
  // و سپس login/change-password، login/mfa-setup(/confirm) یا login/mfa. نشست فقط در پایان صادر می‌شود.
  @AdminPublic()
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async login(@Body() dto: AdminLoginDto, @Req() req: Request) {
    return this.adminAuthService.login(dto, req.ip, req.headers['user-agent']);
  }

  @AdminPublic()
  @Post('login/change-password')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async loginChangePassword(
    @Body() dto: LoginStepPasswordDto,
    @Req() req: Request,
  ) {
    return this.adminAuthService.loginChangePassword(
      dto.challengeToken,
      dto.newPassword,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @AdminPublic()
  @Post('login/mfa-setup')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async loginMfaSetup(@Body() dto: LoginStepDto) {
    return this.adminAuthService.loginMfaSetup(dto.challengeToken);
  }

  @AdminPublic()
  @Post('login/mfa-setup/confirm')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async loginMfaSetupConfirm(
    @Body() dto: LoginStepCodeDto,
    @Req() req: Request,
  ) {
    return this.adminAuthService.loginMfaSetupConfirm(
      dto.challengeToken,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @AdminPublic()
  @Post('login/mfa')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async loginMfa(@Body() dto: LoginStepCodeDto, @Req() req: Request) {
    return this.adminAuthService.loginMfaVerify(
      dto.challengeToken,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // ── ورود نمایندگان با کد یکبارمصرف (فقط شماره‌های ثبت‌شده توسط مدیر؛ بدون ثبت‌نام) ──
  @AdminPublic()
  @Post('agent-otp/request')
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  async requestAgentOtp(@Body() dto: AgentOtpRequestDto, @Req() req: Request) {
    return this.agentOtpLogin.requestCode(dto.phone, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @AdminPublic()
  @Post('agent-otp/verify')
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async verifyAgentOtp(@Body() dto: AgentOtpVerifyDto, @Req() req: Request) {
    return this.agentOtpLogin.verifyCode(dto.phone, dto.code, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
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

  // ── ورود دومرحله‌ای خودِ ادمین ──
  @UseGuards(AdminJwtAuthGuard)
  @Get('mfa')
  async mfaStatus(@Req() req: AuthenticatedAdminRequest) {
    return this.adminAuthService.ownMfaStatus(req.user.adminUserId);
  }

  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/recovery-codes')
  async regenerateRecoveryCodes(
    @Req() req: AuthenticatedAdminRequest,
    @Body() dto: MfaCodeDto,
  ) {
    return this.adminAuthService.regenerateOwnRecoveryCodes(
      req.user.adminUserId,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('mfa/reconfigure')
  async beginReconfigure(
    @Req() req: AuthenticatedAdminRequest,
    @Body() dto: MfaCodeDto,
  ) {
    return this.adminAuthService.beginOwnMfaReconfigure(
      req.user.adminUserId,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/reconfigure/confirm')
  async confirmReconfigure(
    @Req() req: AuthenticatedAdminRequest,
    @Body() dto: MfaCodeDto,
  ) {
    return this.adminAuthService.confirmOwnMfaReconfigure(
      req.user.adminUserId,
      dto.code,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(AdminJwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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
