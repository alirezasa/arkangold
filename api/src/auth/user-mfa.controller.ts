// api/src/auth/user-mfa.controller.ts
//
// مدیریت ورود دومرحله‌ای توسط خود کاربر (FIA_UAU_EXT.2.3، 3.6، FIA_AUX_EXT.1.1):
// - فعال‌سازی برنامه‌ی احراز هویت (روش قوی‌تر از پیامک) با تأیید رمز فعلی و یک کد درست
// - غیرفعال‌سازی/ابطال فوری عامل (مثلاً گم شدن گوشی) با رمز فعلی + کد برنامه یا کد بازیابی
// - تولید دوباره‌ی کدهای بازیابی (کدهای قبلی بلافاصله باطل می‌شوند)
// هر تغییر در گزارش امنیتی ثبت و به کاربر پیامک/اعلان داده می‌شود.
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
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { maskPhone } from '../common/audit/mask.util';
import { MfaService } from '../common/mfa/mfa.service';
import { verifyPassword } from '../common/crypto/password.util';
import { LoginThrottleService } from '../common/auth-security/login-throttle.service';
import { LoginAlertService } from '../common/auth-security/login-alert.service';
import { MfaCodeDto, MfaDisableDto, MfaPasswordDto } from './dto/mfa.dto';

interface AuthedRequest extends Request {
  user: { userId: string; sessionId: string; phone: string };
}

const SOURCE = 'UserMfaController';

@Controller('auth/mfa')
@UseGuards(JwtAuthGuard)
export class UserMfaController {
  constructor(
    private prisma: PrismaService,
    private mfa: MfaService,
    private audit: AuditService,
    private throttle: LoginThrottleService,
    private alerts: LoginAlertService,
  ) {}

  @Get()
  async status(@Req() req: AuthedRequest) {
    const owner = { kind: 'user' as const, id: req.user.userId };
    return {
      ...(await this.mfa.status(owner)),
      devices: await this.alerts.listDevices(owner),
    };
  }

  /** شروع فعال‌سازی: رمز فعلی لازم است (نشست باز به‌تنهایی کافی نیست) */
  @Post('setup')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async setup(@Body() dto: MfaPasswordDto, @Req() req: AuthedRequest) {
    const user = await this.requirePassword(
      req,
      dto.password,
      'auth.mfa_setup',
    );
    if (user.totpEnabled) {
      throw new BadRequestException('ورود دومرحله‌ای از قبل فعال است');
    }
    return this.mfa.beginSetup({ kind: 'user', id: user.id }, user.phone);
  }

  @Post('setup/confirm')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async confirm(@Body() dto: MfaCodeDto, @Req() req: AuthedRequest) {
    const owner = { kind: 'user' as const, id: req.user.userId };
    const recoveryCodes = await this.mfa.confirmSetup(owner, dto.code);
    await this.log(req, 'auth.mfa_enabled', true);
    await this.alerts.onSecurityChange(
      owner,
      'ورود دومرحله‌ای با برنامه‌ی احراز هویت فعال شد',
    );
    return {
      message:
        'ورود دومرحله‌ای فعال شد. کدهای بازیابی را در جای امنی نگه دارید',
      recoveryCodes,
    };
  }

  /** ابطال عامل (گم شدن/سرقت گوشی): رمز فعلی + کد برنامه یا یکی از کدهای بازیابی */
  @Post('disable')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async disable(@Body() dto: MfaDisableDto, @Req() req: AuthedRequest) {
    const user = await this.requirePassword(
      req,
      dto.password,
      'auth.mfa_disable',
    );
    await this.requireCode(req, user.id, dto.code, 'auth.mfa_disable');
    await this.mfa.disable({ kind: 'user', id: user.id });
    await this.log(req, 'auth.mfa_disabled', true);
    await this.alerts.onSecurityChange(
      { kind: 'user', id: user.id },
      'ورود دومرحله‌ای با برنامه‌ی احراز هویت غیرفعال شد (ورود با رمز + کد پیامکی ادامه دارد)',
    );
    return { message: 'برنامه‌ی احراز هویت از حساب شما حذف شد' };
  }

  @Post('recovery-codes')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async regenerate(@Body() dto: MfaCodeDto, @Req() req: AuthedRequest) {
    await this.requireCode(
      req,
      req.user.userId,
      dto.code,
      'auth.mfa_recovery_codes',
    );
    const recoveryCodes = await this.mfa.regenerateRecoveryCodes({
      kind: 'user',
      id: req.user.userId,
    });
    await this.log(req, 'auth.mfa_recovery_codes_regenerated', true);
    await this.alerts.onSecurityChange(
      { kind: 'user', id: req.user.userId },
      'کدهای بازیابی جدید ساخته شد و کدهای قبلی باطل شدند',
    );
    return { recoveryCodes };
  }

  private async requirePassword(
    req: AuthedRequest,
    password: string,
    action: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.userId },
    });
    if (!user) throw new UnauthorizedException();
    const key = `pwconfirm:${user.id}`;
    await this.throttle.assertAllowed('mfa', key, req.ip);
    const check = await verifyPassword(password, user.passwordHash);
    if (!check.valid) {
      await this.throttle.recordFailure('mfa', key, req.ip);
      await this.log(req, action, false, { reason: 'invalid_password' });
      throw new BadRequestException('رمز عبور فعلی نادرست است');
    }
    await this.throttle.recordSuccess('mfa', key);
    return user;
  }

  private async requireCode(
    req: AuthedRequest,
    userId: string,
    code: string,
    action: string,
  ) {
    const key = `user:${userId}`;
    await this.throttle.assertAllowed('mfa', key, req.ip);
    const used = await this.mfa.verify({ kind: 'user', id: userId }, code);
    if (!used) {
      await this.throttle.recordFailure('mfa', key, req.ip);
      await this.log(req, action, false, { reason: 'invalid_code' });
      throw new BadRequestException(
        'کد برنامه‌ی احراز هویت یا کد بازیابی نادرست است',
      );
    }
    await this.throttle.recordSuccess('mfa', key);
    return used;
  }

  private log(
    req: AuthedRequest,
    action: string,
    success: boolean,
    newValue?: Record<string, unknown>,
  ) {
    return this.audit.logUser({
      userId: req.user.userId,
      actorLabel: maskPhone(req.user.phone),
      action,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      source: SOURCE,
      success,
      newValue,
    });
  }
}
