// api/src/security/security-sessions.controller.ts
//
// FTA_TSE_EXT.3.5 — خاتمه‌ی نشست‌ها توسط مدیر سامانه:
//   ۱) نشست‌های یک کاربر خاص در همه‌ی دستگاه‌ها (حساب مشکوک به سرقت، درخواست پشتیبانی)
//   ۲) خروج اضطراری همه‌ی کاربران / همه‌ی ادمین‌ها / همه — در حوادث امنیتی. چون این اقدام کل سامانه
//      را تحت تأثیر قرار می‌دهد، با تفکیک وظایف اجرا می‌شود: یک کارشناس درخواست می‌دهد و کارشناس
//      دوم (با دسترسی مستقل) آن را تأیید می‌کند؛ هر دو با کد برنامه‌ی احراز هویت (FTA_TSE_EXT.4.2).
//      نشست فعلی تأییدکننده باز می‌ماند تا مدیریت حادثه ادامه یابد.
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  JWT_AUDIENCES,
  JWT_ALGORITHM,
  JWT_ISSUER,
} from '../common/secrets/jwt-keyring';
import { PROXY_MAX_SKEW_MS } from '../common/network/client-ip';
import { STEP_UP_PURPOSES } from '../common/auth-security/step-up.service';
import { ZARPAYESH_INSECURE_FLAG } from '../zarpayesh/zarpayesh.constants';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { AdminAuthenticatedUser } from '../admin-auth/interfaces/admin-jwt-payload.interface';
import { RequireAdminStepUp } from '../common/auth-security/step-up.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { LoginAlertService } from '../common/auth-security/login-alert.service';

type Scope = 'users' | 'admins' | 'all';
const SCOPE_FA: Record<Scope, string> = {
  users: 'همه‌ی کاربران',
  admins: 'همه‌ی ادمین‌ها و نمایندگان',
  all: 'همه‌ی کاربران و ادمین‌ها',
};
const AUDIENCE_LABEL: Record<string, string> = {
  JWT_ACCESS_SECRET: 'دسترسی کاربر',
  JWT_REFRESH_SECRET: 'تمدید نشست کاربر',
  JWT_TEMP_SECRET: 'ثبت‌نام',
  JWT_RESET_SECRET: 'بازیابی رمز',
  JWT_ADMIN_SECRET: 'دسترسی پنل',
  JWT_ADMIN_REFRESH_SECRET: 'تمدید نشست پنل',
};
const PENDING_KEY = 'emergency-logout:pending';
const PENDING_TTL = 15 * 60;

class EmergencyRequestDto {
  @IsIn(['users', 'admins', 'all'])
  scope!: Scope;

  @IsString()
  @Length(10, 500, {
    message: 'دلیل خروج اضطراری را بنویسید (۱۰ تا ۵۰۰ کاراکتر)',
  })
  reason!: string;
}

class SessionPolicyDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(1440)
  userIdleMinutes?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  userAbsoluteHours?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(480)
  adminIdleMinutes?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  adminAbsoluteHours?: number;
}

class EmergencyApproveDto {
  @IsString()
  @Length(36, 36)
  requestId!: string;
}

interface Pending {
  id: string;
  scope: Scope;
  reason: string;
  requestedBy: string;
  requestedByName: string;
  requestedAt: string;
}

interface AdminRequest extends Request {
  user: AdminAuthenticatedUser;
}

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin')
export class SecuritySessionsController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private alerts: LoginAlertService,
    private systemConfig: SystemConfigService,
    @Inject('REDIS_CLIENT') private redis: Redis,
  ) {}

  /** تب «نشست و ارتباطات» پنل امنیت (FTA/FTP/FMT) — وضعیت، بدون هیچ راز یا توکن */
  @RequirePermission('security.crypto.view')
  @Get('security/session-comm')
  async sessionComm() {
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const now = new Date();
    const [
      user,
      admin,
      users,
      admins,
      pendingRaw,
      stepOk,
      stepFail,
      adminStepFail,
      lastEmergency,
      zp,
      insecure,
    ] = await Promise.all([
      this.systemConfig.getSessionPolicy('user'),
      this.systemConfig.getSessionPolicy('admin'),
      this.prisma.userSession.count({ where: { expiresAt: { gt: now } } }),
      this.prisma.adminSession.count({ where: { expiresAt: { gt: now } } }),
      this.redis.get(PENDING_KEY),
      this.prisma.auditLog.count({
        where: {
          action: 'auth.step_up',
          success: true,
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'auth.step_up',
          success: false,
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.adminAuditLog.count({
        where: {
          action: 'admin_auth.step_up',
          success: false,
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.adminAuditLog.findFirst({
        where: { action: 'security.emergency_logout' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, newValue: true },
      }),
      this.prisma.zarPayeshConfig.findFirst({ select: { baseUrl: true } }),
      this.systemConfig.get(ZARPAYESH_INSECURE_FLAG, 'false'),
    ]);
    const pending = pendingRaw ? (JSON.parse(pendingRaw) as Pending) : null;
    const dbUrl = process.env.DATABASE_URL ?? '';
    return {
      sessionPolicy: {
        user: {
          idleMinutes: user.accessTtlSeconds / 60,
          absoluteHours: user.refreshTtlSeconds / 3600,
        },
        admin: {
          idleMinutes: admin.accessTtlSeconds / 60,
          absoluteHours: admin.refreshTtlSeconds / 3600,
        },
      },
      activeSessions: { users, admins },
      emergency: {
        pending: pending
          ? { ...pending, scopeLabel: SCOPE_FA[pending.scope] }
          : null,
        last: lastEmergency,
      },
      stepUp: {
        userActions: Object.values(STEP_UP_PURPOSES),
        adminActions: [
          'اصلاح دستی موجودی کیف پول (کاربر و نماینده)',
          'ایجاد ادمین، تغییر نقش‌ها و وضعیت',
          'بازنشانی رمز یا ورود دومرحله‌ای ادمین و کاربر',
          'درخواست و تأیید خروج اضطراری',
        ],
        last7d: {
          userVerified: stepOk,
          userFailed: stepFail,
          adminFailed: adminStepFail,
        },
      },
      tokens: {
        algorithm: JWT_ALGORITHM,
        issuer: JWT_ISSUER,
        // نام نوع توکن (نه نام متغیر محیطی) ← مخاطب مجاز
        audiences: Object.fromEntries(
          Object.entries(JWT_AUDIENCES).map(([k, v]) => [
            AUDIENCE_LABEL[k] ?? k,
            v,
          ]),
        ),
        cookiePrefix: '__Host-',
      },
      serviceAuth: {
        bffSigning: !!process.env.INTERNAL_PROXY_SECRET,
        scheme: 'HMAC-SHA256 + nonce یک‌بارمصرف',
        maxSkewSeconds: PROXY_MAX_SKEW_MS / 1000,
      },
      transport: {
        databaseTls: /[?&]sslmode=(require|verify-ca|verify-full)\b/.test(
          dbUrl,
        ),
        databaseCertVerified: /[?&]sslmode=verify-full\b/.test(dbUrl),
        redisTls: process.env.REDIS_TLS === 'true',
        clamavConfigured: !!process.env.CLAMAV_HOST,
        zarpayesh: zp
          ? {
              https: /^https:\/\//i.test(zp.baseUrl),
              insecureAllowed: insecure === 'true',
            }
          : null,
      },
    };
  }

  /** زمان‌های نشست (FTA_TSE_EXT.2.1 / 2.2) — با کد برنامه‌ی احراز هویت */
  @RequirePermission('security.crypto.manage')
  @AuditLog('security.session_policy.update')
  @UseInterceptors(AuditLogInterceptor)
  @RequireAdminStepUp('تغییر زمان‌های نشست')
  @Put('security/session-comm/policy')
  async updatePolicy(@Body() dto: SessionPolicyDto) {
    const pairs: [string, number | undefined][] = [
      ['session.user.timeout_minutes', dto.userIdleMinutes],
      ['session.user.absolute_hours', dto.userAbsoluteHours],
      ['session.admin.timeout_minutes', dto.adminIdleMinutes],
      ['session.admin.refresh_hours', dto.adminAbsoluteHours],
    ];
    const updates = pairs.flatMap(([k, v]) =>
      v === undefined ? [] : [[k, v] as const],
    );
    if (!updates.length) throw new BadRequestException('تغییری ارسال نشده است');
    for (const [k, v] of updates) await this.systemConfig.set(k, String(v));
    await this.systemConfig.invalidateCache();
    return { message: 'زمان‌های نشست ذخیره شد' };
  }

  /** خاتمه‌ی همه‌ی نشست‌های یک کاربر */
  @RequirePermission('users.sessions.revoke')
  @AuditLog('user.sessions_revoked')
  @UseInterceptors(AuditLogInterceptor)
  @Post('users/:id/sessions/revoke')
  async revokeUser(@Param('id', ParseUUIDPipe) id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('کاربر یافت نشد');
    const { count } = await this.prisma.userSession.deleteMany({
      where: { userId: id },
    });
    await this.alerts.onSecurityChange(
      { kind: 'user', id },
      'همه‌ی نشست‌های حساب شما توسط پشتیبانی بسته شد؛ برای ادامه دوباره وارد شوید',
    );
    return {
      message: `${count.toLocaleString('fa-IR')} نشست کاربر بسته شد`,
      revoked: count,
    };
  }

  @RequirePermission('security.sessions.emergency')
  @Get('security/sessions')
  async status() {
    const now = new Date();
    const [users, admins, pendingRaw] = await Promise.all([
      this.prisma.userSession.count({ where: { expiresAt: { gt: now } } }),
      this.prisma.adminSession.count({ where: { expiresAt: { gt: now } } }),
      this.redis.get(PENDING_KEY),
    ]);
    const pending = pendingRaw ? (JSON.parse(pendingRaw) as Pending) : null;
    return {
      activeSessions: { users, admins },
      pending: pending
        ? { ...pending, scopeLabel: SCOPE_FA[pending.scope] }
        : null,
    };
  }

  /** مرحله‌ی ۱: درخواست خروج اضطراری (کارشناس اول) */
  @RequirePermission('security.sessions.emergency')
  @AuditLog('security.emergency_logout.request')
  @UseInterceptors(AuditLogInterceptor)
  @RequireAdminStepUp('درخواست خروج اضطراری')
  @Post('security/sessions/emergency/request')
  async request(@Body() dto: EmergencyRequestDto, @Req() req: AdminRequest) {
    const pending: Pending = {
      id: randomUUID(),
      scope: dto.scope,
      reason: dto.reason.trim(),
      requestedBy: req.user.adminUserId,
      requestedByName: req.user.username,
      requestedAt: new Date().toISOString(),
    };
    const ok = await this.redis.set(
      PENDING_KEY,
      JSON.stringify(pending),
      'EX',
      PENDING_TTL,
      'NX',
    );
    if (ok !== 'OK') {
      throw new ConflictException(
        'یک درخواست خروج اضطراری در انتظار تأیید است',
      );
    }
    return {
      message: `درخواست «خروج ${SCOPE_FA[dto.scope]}» ثبت شد؛ کارشناس دوم باید ظرف ۱۵ دقیقه آن را تأیید کند`,
      pending,
    };
  }

  /** مرحله‌ی ۲: تأیید و اجرا (فقط کارشناسی غیر از درخواست‌دهنده) */
  @RequirePermission('security.sessions.emergency')
  @AuditLog('security.emergency_logout.execute')
  @UseInterceptors(AuditLogInterceptor)
  @RequireAdminStepUp('تأیید خروج اضطراری')
  @Post('security/sessions/emergency/approve')
  async approve(@Body() dto: EmergencyApproveDto, @Req() req: AdminRequest) {
    const raw = await this.redis.get(PENDING_KEY);
    const pending = raw ? (JSON.parse(raw) as Pending) : null;
    if (!pending || pending.id !== dto.requestId) {
      throw new BadRequestException(
        'درخواست خروج اضطراری یافت نشد یا منقضی شده است',
      );
    }
    if (pending.requestedBy === req.user.adminUserId) {
      throw new ForbiddenException(
        'تأیید باید توسط کارشناسی غیر از درخواست‌دهنده انجام شود (تفکیک وظایف)',
      );
    }
    // حذف اتمی تا دو تأیید هم‌زمان دو بار اجرا نشوند
    const res = await this.redis
      .multi()
      .get(PENDING_KEY)
      .del(PENDING_KEY)
      .exec();
    if (!res?.[0]?.[1])
      throw new BadRequestException('درخواست قبلاً اجرا شده است');

    let users = 0;
    let admins = 0;
    if (pending.scope === 'users' || pending.scope === 'all') {
      users = (await this.prisma.userSession.deleteMany({})).count;
    }
    if (pending.scope === 'admins' || pending.scope === 'all') {
      admins = (
        await this.prisma.adminSession.deleteMany({
          where: { id: { not: req.user.sessionId } },
        })
      ).count;
    }
    await this.audit.logAdmin({
      adminUserId: req.user.adminUserId,
      action: 'security.emergency_logout',
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      source: SecuritySessionsController.name,
      success: true,
      newValue: {
        scope: pending.scope,
        reason: pending.reason,
        requestedBy: pending.requestedBy,
        approvedBy: req.user.adminUserId,
        revoked: { users, admins },
      },
    });
    return {
      message: `خروج اضطراری ${SCOPE_FA[pending.scope]} اجرا شد: ${users.toLocaleString('fa-IR')} نشست کاربر و ${admins.toLocaleString('fa-IR')} نشست ادمین بسته شد`,
      revoked: { users, admins },
    };
  }

  @RequirePermission('security.sessions.emergency')
  @AuditLog('security.emergency_logout.cancel')
  @UseInterceptors(AuditLogInterceptor)
  @Post('security/sessions/emergency/cancel')
  async cancel(@Body() dto: EmergencyApproveDto) {
    const raw = await this.redis.get(PENDING_KEY);
    const pending = raw ? (JSON.parse(raw) as Pending) : null;
    if (!pending || pending.id !== dto.requestId) {
      throw new BadRequestException('درخواست خروج اضطراری یافت نشد');
    }
    await this.redis.del(PENDING_KEY);
    return { message: 'درخواست خروج اضطراری لغو شد' };
  }
}
