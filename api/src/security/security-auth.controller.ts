// api/src/security/security-auth.controller.ts
// بخش «احراز هویت» پنل امنیت (کلاس FIA): سیاست رمز عبور، پوشش ورود دومرحله‌ای، حساب‌های پیش‌فرض،
// رمزهای موقت، محدودسازی تلاش‌ها، هشدارهای ورود، یادآوری انقضا و فهرست مسیرهای احراز هویت.
import {
  Controller,
  Get,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminJwtAuthGuard } from '../admin-auth/guards/admin-jwt-auth.guard';
import { AdminPermissionGuard } from '../admin-auth/guards/admin-permission.guard';
import { RequirePermission } from '../admin-auth/decorators/require-permission.decorator';
import { AuditLog } from '../admin-auth/decorators/audit-log.decorator';
import { AuditLogInterceptor } from '../admin-auth/interceptors/audit-log.interceptor';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { PasswordPolicyService } from '../common/password-policy/password-policy.service';
import { LoginThrottleService } from '../common/auth-security/login-throttle.service';
import { CredentialExpiryService } from '../common/auth-security/credential-expiry.service';
import { isReservedUsername } from '../common/auth-security/account-hygiene';
import { AUTH_PATHS } from '../common/auth-security/auth-paths.const';
import { TOTP_STEP_SECONDS, TOTP_WINDOW } from '../common/mfa/totp.util';

const DAY_MS = 24 * 60 * 60 * 1000;

@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@Controller('admin/security')
export class SecurityAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
    private readonly policy: PasswordPolicyService,
    private readonly throttle: LoginThrottleService,
    private readonly expiry: CredentialExpiryService,
  ) {}

  @Get('auth-status')
  @RequirePermission('security.crypto.view')
  async authStatus() {
    const now = Date.now();
    const since24h = new Date(now - DAY_MS);
    const since7d = new Date(now - 7 * DAY_MS);

    const admins = await this.prisma.adminUser.findMany({
      where: { isActive: true },
      select: {
        id: true,
        username: true,
        fullName: true,
        agentId: true,
        totpEnabled: true,
        mustChangePassword: true,
        passwordExpiresAt: true,
        lastLoginAt: true,
        phone: true,
      },
      orderBy: { username: 'asc' },
    });
    const staff = admins.filter((a) => !a.agentId);
    const agents = admins.filter((a) => a.agentId);

    const [
      usersTotal,
      usersTotp,
      userFailed24h,
      adminFailed24h,
      userLocked7d,
      adminLocked7d,
      rateLimited24h,
      alerts7d,
      throttleStats,
      thresholds,
      upcoming,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { totpEnabled: true } }),
      this.prisma.auditLog.count({
        where: {
          action: { in: ['auth.login', 'auth.login_mfa'] },
          success: false,
          createdAt: { gte: since24h },
        },
      }),
      this.prisma.adminAuditLog.count({
        where: {
          action: {
            in: [
              'admin_auth.login',
              'admin_auth.login_mfa',
              'admin_auth.login_otp',
            ],
          },
          success: false,
          createdAt: { gte: since24h },
        },
      }),
      this.prisma.auditLog.count({
        where: { action: 'auth.account_locked', createdAt: { gte: since7d } },
      }),
      this.prisma.adminAuditLog.count({
        where: {
          action: 'admin_auth.account_locked',
          createdAt: { gte: since7d },
        },
      }),
      this.prisma.auditLog.count({
        where: {
          action: 'security.rate_limit_exceeded',
          createdAt: { gte: since24h },
        },
      }),
      this.prisma.smsLog.count({
        where: { referenceType: 'SECURITY_ALERT', createdAt: { gte: since7d } },
      }),
      this.throttle.stats(),
      this.expiry.thresholds(),
      this.expiry.upcoming(),
    ]);

    return {
      passwordPolicy: await this.policy.describe(),
      mfa: {
        totp: {
          algorithm: 'HMAC-SHA1 (RFC 6238)',
          digits: 6,
          stepSeconds: TOTP_STEP_SECONDS,
          maxValiditySeconds: TOTP_STEP_SECONDS * (2 * TOTP_WINDOW + 1),
        },
        staff: {
          total: staff.length,
          enrolled: staff.filter((a) => a.totpEnabled).length,
        },
        agents: {
          total: agents.length,
          enrolled: agents.filter((a) => a.totpEnabled).length,
        },
        users: { total: usersTotal, totp: usersTotp },
        notEnrolled: admins
          .filter((a) => !a.totpEnabled)
          .slice(0, 50)
          .map((a) => ({
            username: a.username,
            fullName: a.fullName,
            isAgent: !!a.agentId,
            lastLoginAt: a.lastLoginAt,
          })),
      },
      accounts: {
        reservedUsernames: admins
          .filter((a) => isReservedUsername(a.username))
          .map((a) => ({ username: a.username, fullName: a.fullName })),
        withoutPhone: admins
          .filter((a) => !a.phone)
          .map((a) => ({ username: a.username, fullName: a.fullName })),
        tempPasswords: admins
          .filter((a) => a.mustChangePassword)
          .map((a) => ({
            username: a.username,
            fullName: a.fullName,
            expiresAt: a.passwordExpiresAt,
            expired:
              !!a.passwordExpiresAt && a.passwordExpiresAt.getTime() < now,
          })),
      },
      bruteForce: {
        freeAttempts: 5,
        maxDelaySeconds: 15 * 60,
        failedLogins24h: { users: userFailed24h, admins: adminFailed24h },
        throttledAccounts7d: { users: userLocked7d, admins: adminLocked7d },
        rateLimited24h,
        ...throttleStats,
      },
      alerts: {
        enabled: await this.systemConfig.getBoolean(
          'security.login_alerts.enabled',
          true,
        ),
        sent7d: alerts7d,
      },
      expiry: {
        reminderDays: thresholds,
        apiKeyLifetimeDays: await this.systemConfig.getNumber(
          'security.api_key.lifetime_days',
          365,
        ),
        items: upcoming.map((i) => ({
          kind: i.kind,
          label: i.label,
          expiresAt: i.expiresAt,
          daysLeft: i.daysLeft,
        })),
      },
      authPaths: AUTH_PATHS,
    };
  }

  @Post('expiry-reminders/run')
  @RequirePermission('security.crypto.manage')
  @AuditLog('security.expiry_reminders.run')
  @UseInterceptors(AuditLogInterceptor)
  runExpiryReminders() {
    return this.expiry.run();
  }
}
