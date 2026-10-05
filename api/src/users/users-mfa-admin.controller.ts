// api/src/users/users-mfa-admin.controller.ts
//
// FIA_UID_EXT.1.4 — بازیابی ورود دومرحله‌ای کاربری که برنامه‌ی احراز هویت و کدهای بازیابی را
// از دست داده است. بازیابی هم‌سطح ثبت‌نام اولیه است: کاربر باید هویت احرازشده در زمان ثبت‌نام
// (استعلام ثبت احوال) را دوباره ثابت کند — کارشناس پس از تطبیق حضوری/تصویری چهره با کارت ملی،
// کد ملی ارائه‌شده را وارد می‌کند و فقط در صورت تطابق با هویت تأییدشده‌ی حساب، عامل دوم باطل
// می‌شود. همه‌ی نشست‌ها بسته می‌شوند، رویداد ثبت و به کاربر پیامک/اعلان داده می‌شود.
// مسیر عادی ورود کاربر پس از بازنشانی همچنان رمز + کد پیامکی (دو عامل) است.
import {
  BadRequestException,
  Body,
  Controller,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsString, Length, Matches } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { MfaService } from '../common/mfa/mfa.service';
import { LoginAlertService } from '../common/auth-security/login-alert.service';
import { LoginThrottleService } from '../common/auth-security/login-throttle.service';

class ResetUserMfaDto {
  // کد ملی‌ای که کاربر در فرایند احراز هویت مجدد ارائه کرده است
  @Matches(/^\d{10}$/, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode!: string;

  @IsString()
  @Length(10, 500, {
    message:
      'شرح روش احراز هویت مجدد (مثلاً تماس تصویری و تطبیق کارت ملی) را بنویسید',
  })
  reason!: string;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/users')
export class UsersMfaAdminController {
  constructor(
    private prisma: PrismaService,
    private mfa: MfaService,
    private alerts: LoginAlertService,
    private throttle: LoginThrottleService,
  ) {}

  @RequirePermission('users.mfa.reset')
  @AuditLog('user.mfa_reset')
  @UseInterceptors(AuditLogInterceptor)
  @Post(':id/mfa/reset')
  async reset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResetUserMfaDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { identity: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    if (!user.totpEnabled) {
      throw new BadRequestException(
        'ورود دومرحله‌ای با برنامه برای این کاربر فعال نیست',
      );
    }
    if (user.identity?.status !== 'VERIFIED' || !user.identity.nationalCode) {
      throw new BadRequestException(
        'هویت این کاربر احراز نشده است؛ بازیابی فقط پس از احراز هویت کامل ممکن است',
      );
    }
    if (user.identity.nationalCode !== dto.nationalCode) {
      throw new BadRequestException(
        'کد ملی با هویت تأییدشده‌ی این حساب مطابقت ندارد؛ بازیابی انجام نشد',
      );
    }

    await this.mfa.disable({ kind: 'user', id });
    await this.prisma.userSession.deleteMany({ where: { userId: id } });
    await this.throttle.clear('mfa', `user:${id}`);
    await this.alerts.onSecurityChange(
      { kind: 'user', id },
      'ورود دومرحله‌ای با برنامه توسط پشتیبانی پس از احراز هویت مجدد باطل شد و همه‌ی نشست‌ها بسته شدند',
    );
    return {
      message:
        'برنامه‌ی احراز هویت کاربر باطل شد و همه‌ی نشست‌هایش بسته شد. کاربر با رمز + کد پیامکی وارد می‌شود و می‌تواند دوباره برنامه را فعال کند',
    };
  }
}
