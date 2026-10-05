// api/src/admin-auth/admin-auth.service.ts
import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { maskUsername } from '../common/audit/mask.util';
import * as crypto from 'crypto';
import { jwtSignOptions } from '../common/secrets/jwt-keyring';
import { hashPassword, verifyPassword } from '../common/crypto/password.util';
import { PasswordPolicyService } from '../common/password-policy/password-policy.service';
import { LoginThrottleService } from '../common/auth-security/login-throttle.service';
import { PowCaptchaService } from '../common/auth-security/pow-captcha.service';
import { LoginAlertService } from '../common/auth-security/login-alert.service';
import {
  LoginChallenge,
  LoginChallengeService,
} from '../common/auth-security/login-challenge.service';
import { MfaService } from '../common/mfa/mfa.service';
import { SystemConfigService } from '../system-config/system-config.service';
import {
  ADMIN_ROLES_INCLUDE,
  ADMIN_ROLES_WITH_PERMISSIONS_INCLUDE,
  mergePermissions,
  summarizeRoles,
} from './admin-roles.util';

const AUDIT_SOURCE = 'AdminAuthService';

/** درگاه ورود: admin.arkan.gold (کارشناسان) یا panel.arkan.gold (نمایندگان فروش) */
export type AdminLoginPortal = 'admin' | 'agent';

interface LoginDto {
  username: string;
  password: string;
  portal?: AdminLoginPortal;
  captcha?: string;
}

/**
 * پاسخ هر مرحله‌ی ورود پنل تا وقتی همه‌ی مراحل کامل نشده؛ نشست فقط در پایان صادر می‌شود.
 * FIA_UAU_EXT.2.3: برای ادمین‌ها و نمایندگان، رمز عبور + برنامه‌ی احراز هویت (TOTP) اجباری است.
 */
export interface AdminLoginStep {
  next: 'CHANGE_PASSWORD' | 'MFA_SETUP' | 'MFA_VERIFY';
  challengeToken: string;
  minPasswordLength?: number;
  message: string;
}

const INVALID_CREDS_MSG = 'نام کاربری یا رمز عبور نادرست است';

const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'admin.arkan.gold';
const AGENT_PANEL_URL = process.env.AGENT_PANEL_URL || 'panel.arkan.gold';

type LoginAdmin = {
  id: string;
  username: string;
  fullName: string;
  roles: { role: { key: string; name: string } }[];
};

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private systemConfig: SystemConfigService,
    private passwordPolicy: PasswordPolicyService,
    private loginThrottle: LoginThrottleService,
    private captcha: PowCaptchaService,
    private loginAlerts: LoginAlertService,
    private challenges: LoginChallengeService,
    private mfa: MfaService,
  ) {}

  async login(
    dto: LoginDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AdminLoginStep> {
    const username = dto.username.trim();
    // FIA_UAU_EXT.2.1: تأخیر فزاینده و بررسی امنیتی برای هر نام کاربری (موجود یا ناموجود، یکسان)
    await this.loginThrottle.assertAllowed('admin', username, ip);
    await this.captcha.enforce(
      await this.loginThrottle.captchaRequired(
        'admin',
        username,
        ip,
        userAgent,
      ),
      dto.captcha,
    );

    const admin = await this.prisma.adminUser.findUnique({
      where: { username },
      include: ADMIN_ROLES_INCLUDE,
    });
    // FIA_UAU_EXT.2.7: مقایسه‌ی bcrypt برای نام کاربری ناموجود هم انجام می‌شود (زمان پاسخ یکسان)
    const check = await verifyPassword(dto.password, admin?.passwordHash);

    if (!admin || !check.valid) {
      const result = await this.loginThrottle.recordFailure(
        'admin',
        username,
        ip,
      );
      if (admin) {
        await this.mirrorFailure(admin, result, ip, userAgent);
      }
      await this.auditService.logAdmin({
        adminUserId: admin?.id ?? null,
        actorLabel: admin ? undefined : maskUsername(username),
        action: 'admin_auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: admin ? { reason: 'invalid_password' } : undefined,
      });
      throw new UnauthorizedException(INVALID_CREDS_MSG);
    }

    // وضعیت حساب فقط پس از اثبات رمز اعلام می‌شود
    if (!admin.isActive) {
      await this.auditService.logAdmin({
        adminUserId: admin.id,
        action: 'admin_auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'inactive' },
      });
      throw new ForbiddenException('حساب ادمین غیرفعال است');
    }

    // FIA_UID_EXT.1.1: رمز موقت فقط ۲۴ ساعت اعتبار دارد
    if (
      admin.mustChangePassword &&
      admin.passwordExpiresAt &&
      admin.passwordExpiresAt < new Date()
    ) {
      await this.auditService.logAdmin({
        adminUserId: admin.id,
        action: 'admin_auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'temp_password_expired' },
      });
      throw new UnauthorizedException(
        'رمز موقت شما منقضی شده است؛ از مدیر سیستم بخواهید رمز موقت جدید برایتان صادر کند',
      );
    }

    // حساب نماینده فقط از پنل نمایندگان و کارشناسان فقط از پنل مدیریت وارد می‌شوند
    // (بررسی پس از تأیید رمز تا وجود نام کاربری یا نوع حساب افشا نشود)
    this.assertPortal(dto.portal, !!admin.agentId, {
      adminUserId: admin.id,
      ip,
      userAgent,
    });

    if (check.needsRehash) {
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash: await hashPassword(dto.password) },
      });
    }

    await this.auditService.logAdmin({
      adminUserId: admin.id,
      action: 'admin_auth.login_first_factor',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return this.startSecondStage(admin, 'password', username);
  }

  /**
   * مرحله‌ی بعد از عامل اول (رمز یا کد پیامکی نماینده): تغییر رمز موقت (فقط مسیر رمز)،
   * سپس راه‌اندازی اجباری یا بررسی برنامه‌ی احراز هویت.
   */
  async startSecondStage(
    admin: { id: string; mustChangePassword: boolean; totpEnabled: boolean },
    via: LoginChallenge['via'],
    identifier: string,
  ): Promise<AdminLoginStep> {
    const stage =
      via === 'password' && admin.mustChangePassword
        ? 'CHANGE_PASSWORD'
        : admin.totpEnabled
          ? 'MFA_VERIFY'
          : 'MFA_SETUP';
    const challengeToken = await this.challenges.create({
      kind: 'admin',
      accountId: admin.id,
      stage,
      via,
      purpose: 'login',
      identifier,
    });
    return this.stepResponse(stage, challengeToken);
  }

  private async stepResponse(
    stage: AdminLoginStep['next'],
    challengeToken: string,
  ): Promise<AdminLoginStep> {
    if (stage === 'CHANGE_PASSWORD') {
      return {
        next: stage,
        challengeToken,
        minPasswordLength: await this.passwordPolicy.minLength('admin'),
        message:
          'رمز فعلی شما موقت است؛ برای ادامه یک رمز عبور جدید تعیین کنید',
      };
    }
    return {
      next: stage,
      challengeToken,
      message:
        stage === 'MFA_SETUP'
          ? 'ورود دومرحله‌ای برای حساب‌های پنل اجباری است؛ برنامه‌ی احراز هویت را راه‌اندازی کنید'
          : 'کد ۶ رقمی برنامه‌ی احراز هویت (یا یکی از کدهای بازیابی) را وارد کنید',
    };
  }

  /** مرحله‌ی تغییر اجباری رمز موقت (FIA_UID_EXT.1.1 بند ۳) */
  async loginChangePassword(
    challengeToken: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<AdminLoginStep> {
    const ch = await this.challenges.get(challengeToken, 'admin', [
      'CHANGE_PASSWORD',
    ]);
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: ch.accountId },
    });
    if (!admin) throw new UnauthorizedException(INVALID_CREDS_MSG);
    const same = await verifyPassword(newPassword, admin.passwordHash);
    if (same.valid) {
      throw new BadRequestException('رمز جدید نباید با رمز موقت یکسان باشد');
    }
    await this.passwordPolicy.assertAcceptable(newPassword, 'admin', {
      username: admin.username,
      fullName: admin.fullName,
      phone: admin.phone,
    });
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordExpiresAt: null,
        passwordChangedAt: new Date(),
      },
    });
    await this.auditService.logAdmin({
      adminUserId: admin.id,
      action: 'admin_auth.change_temp_password',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    const stage = admin.totpEnabled ? 'MFA_VERIFY' : 'MFA_SETUP';
    await this.challenges.advance(challengeToken, ch, stage);
    return this.stepResponse(stage, challengeToken);
  }

  /** راه‌اندازی برنامه‌ی احراز هویت در حین ورود (اولین ورود یا پس از بازنشانی توسط مدیر) */
  async loginMfaSetup(challengeToken: string) {
    const ch = await this.challenges.get(challengeToken, 'admin', [
      'MFA_SETUP',
    ]);
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: ch.accountId },
    });
    if (!admin) throw new UnauthorizedException(INVALID_CREDS_MSG);
    return this.mfa.beginSetup({ kind: 'admin', id: admin.id }, admin.username);
  }

  async loginMfaSetupConfirm(
    challengeToken: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    const ch = await this.challenges.get(challengeToken, 'admin', [
      'MFA_SETUP',
    ]);
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: ch.accountId },
      include: ADMIN_ROLES_INCLUDE,
    });
    if (!admin) throw new UnauthorizedException(INVALID_CREDS_MSG);
    let recoveryCodes: string[];
    try {
      recoveryCodes = await this.mfa.confirmSetup(
        { kind: 'admin', id: admin.id },
        code,
      );
    } catch (err) {
      const remaining = await this.challenges.fail(challengeToken, ch);
      if (remaining === 0) {
        throw new UnauthorizedException(
          'تعداد تلاش‌های مجاز به پایان رسید؛ دوباره وارد شوید',
        );
      }
      throw err;
    }
    await this.challenges.consume(challengeToken);
    await this.auditService.logAdmin({
      adminUserId: admin.id,
      action: 'admin_auth.mfa_enabled',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    await this.loginAlerts.onSecurityChange(
      this.alertOwner(admin),
      'برنامه‌ی احراز هویت برای ورود دومرحله‌ای ثبت شد',
    );
    const session = await this.finishLogin(admin, ch, ip, userAgent, 'totp');
    return { ...session, recoveryCodes };
  }

  /** بررسی کد برنامه‌ی احراز هویت یا کد بازیابی */
  async loginMfaVerify(
    challengeToken: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    const ch = await this.challenges.get(challengeToken, 'admin', [
      'MFA_VERIFY',
    ]);
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: ch.accountId },
      include: ADMIN_ROLES_INCLUDE,
    });
    if (!admin) throw new UnauthorizedException(INVALID_CREDS_MSG);
    const mfaKey = `admin:${admin.id}`;
    await this.loginThrottle.assertAllowed('mfa', mfaKey, ip);
    const used = await this.mfa.verify({ kind: 'admin', id: admin.id }, code);
    if (!used) {
      const remaining = await this.challenges.fail(challengeToken, ch);
      await this.loginThrottle.recordFailure('mfa', mfaKey, ip);
      await this.auditService.logAdmin({
        adminUserId: admin.id,
        action: 'admin_auth.login_mfa',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'invalid_totp', remaining },
      });
      throw new UnauthorizedException(
        remaining > 0
          ? `کد نادرست است (${remaining.toLocaleString('fa-IR')} تلاش باقی‌مانده)`
          : 'تعداد تلاش‌های مجاز به پایان رسید؛ دوباره وارد شوید',
      );
    }
    await this.challenges.consume(challengeToken);
    await this.loginThrottle.recordSuccess('mfa', mfaKey);
    if (used === 'recovery_code') {
      await this.loginAlerts.onSecurityChange(
        this.alertOwner(admin),
        'ورود با یکی از کدهای بازیابی انجام شد',
      );
    }
    return this.finishLogin(admin, ch, ip, userAgent, used);
  }

  private async finishLogin(
    admin: LoginAdmin & { phone: string | null },
    ch: LoginChallenge,
    ip: string | undefined,
    userAgent: string | undefined,
    mfa: 'totp' | 'recovery_code',
  ) {
    if (ch.identifier) {
      await this.loginThrottle.recordSuccess(
        ch.via === 'agent_otp' ? 'agent' : 'admin',
        ch.identifier,
      );
    }
    const result = await this.completeLogin(
      admin,
      ip,
      userAgent,
      ch.via === 'agent_otp' ? 'admin_auth.login_otp' : 'admin_auth.login',
      { mfa },
    );
    await this.loginAlerts.onSuccessfulLogin(
      this.alertOwner(admin),
      ip,
      userAgent,
    );
    return result;
  }

  alertOwner(admin: {
    id: string;
    phone: string | null;
    fullName: string;
    username: string;
  }) {
    return {
      kind: 'admin' as const,
      id: admin.id,
      phone: admin.phone,
      fullName: admin.fullName,
      username: admin.username,
    };
  }

  /** بازتاب شمارنده‌ی Redis در ستون‌های حساب (نمایش در مدیریت ادمین‌ها) + رویداد قفل و هشدار */
  private async mirrorFailure(
    admin: {
      id: string;
      phone: string | null;
      fullName: string;
      username: string;
    },
    result: { failures: number; delaySeconds: number; justThrottled: boolean },
    ip?: string,
    userAgent?: string,
  ) {
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: result.failures,
        lockedUntil: result.delaySeconds
          ? new Date(Date.now() + result.delaySeconds * 1000)
          : undefined,
      },
    });
    if (result.justThrottled) {
      this.logger.warn(
        `[AdminAuth] حساب ${admin.id} به دلیل تلاش‌های ناموفق مکرر وارد دوره‌ی تأخیر شد`,
      );
      // FAU_GEN_EXT.1.5: ورود حساب به دوره‌ی تأخیر به دلیل تلاش‌های ناموفق مکرر
      await this.auditService.logAdmin({
        adminUserId: admin.id,
        action: 'admin_auth.account_locked',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: {
          failedAttempts: result.failures,
          policy: 'progressive_delay',
        },
      });
      await this.loginAlerts.onRepeatedFailures(
        this.alertOwner(admin),
        result.failures,
        ip,
      );
    }
  }

  /**
   * درگاه ورود باید با نوع حساب بخواند. FIA_UAU_EXT.2.4: درخواست بدون portal (کلاینت قدیمی یا
   * فراخوانی مستقیم API) دیگر مسیر بدون بررسی نیست و درگاه «مدیریت» در نظر گرفته می‌شود.
   */
  assertPortal(
    portalInput: AdminLoginPortal | undefined,
    isAgentAccount: boolean,
    ctx: { adminUserId: string; ip?: string; userAgent?: string },
  ) {
    const portal: AdminLoginPortal = portalInput ?? 'admin';
    const mismatch =
      (portal === 'admin' && isAgentAccount) ||
      (portal === 'agent' && !isAgentAccount);
    if (!mismatch) return;
    void this.auditService.logAdmin({
      adminUserId: ctx.adminUserId,
      action: 'admin_auth.login',
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      source: AUDIT_SOURCE,
      success: false,
      newValue: { reason: 'wrong_portal', portal },
    });
    throw new ForbiddenException(
      isAgentAccount
        ? `حساب نمایندگی از نشانی ${AGENT_PANEL_URL} وارد شوید`
        : `این نشانی مخصوص نمایندگان فروش است؛ کارشناسان از ${ADMIN_PANEL_URL} وارد شوند`,
    );
  }

  /** ورود موفق (رمز یا کد یکبارمصرف): ریست شمارنده، ثبت آخرین ورود، صدور نشست و لاگ */
  async completeLogin(
    admin: LoginAdmin,
    ip: string | undefined,
    userAgent: string | undefined,
    action: 'admin_auth.login' | 'admin_auth.login_otp',
    extra?: Record<string, unknown>,
  ) {
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });

    // فقط پس از گذر از همه‌ی مراحل (رمز/کد پیامکی + TOTP) فراخوانی می‌شود
    const tokens = await this.createSession(admin.id, ip, userAgent);

    this.logger.log(`[AdminAuth] ورود موفق: ${admin.username} از IP ${ip}`);
    await this.auditService.logAdmin({
      adminUserId: admin.id,
      action,
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
      newValue: extra,
    });

    return {
      ...tokens,
      admin: {
        id: admin.id,
        username: admin.username,
        fullName: admin.fullName,
        ...summarizeRoles(
          admin.roles.map((r) => ({
            role: { key: r.role.key, name: r.role.name },
          })),
        ),
      },
    };
  }

  async refreshToken(refreshToken: string) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.prisma.adminSession.findFirst({
      where: { refreshTokenHash: hash, expiresAt: { gt: new Date() } },
      include: { adminUser: true },
    });
    if (!session)
      throw new UnauthorizedException('رفرش توکن نامعتبر یا منقضی شده است');
    if (!session.adminUser.isActive)
      throw new ForbiddenException('حساب ادمین غیرفعال است');

    await this.prisma.adminSession.delete({ where: { id: session.id } });
    return this.createSession(
      session.adminUserId,
      session.ip ?? undefined,
      session.userAgent ?? undefined,
    );
  }

  async logout(
    adminUserId: string,
    sessionId: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.prisma.adminSession
      .delete({ where: { id: sessionId } })
      .catch(() => {});
    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.logout',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return { message: 'با موفقیت خارج شدید' };
  }

  async logoutAll(adminUserId: string, ip?: string, userAgent?: string) {
    await this.prisma.adminSession.deleteMany({ where: { adminUserId } });
    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.logout_all',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return { message: 'از تمام دستگاه‌ها خارج شدید' };
  }

  async getMe(adminUserId: string, currentSessionId?: string) {
    const now = new Date();
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
      include: {
        ...ADMIN_ROLES_WITH_PERMISSIONS_INCLUDE,
        agent: {
          select: { id: true, code: true, name: true, status: true },
        },
        createdBy: { select: { fullName: true } },
        _count: {
          select: { sessions: { where: { expiresAt: { gt: now } } } },
        },
      },
    });
    if (!admin) throw new NotFoundException('ادمین یافت نشد');
    const permissionDetails = mergePermissions(admin.roles);

    return {
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      phone: admin.phone,
      totpEnabled: admin.totpEnabled,
      lastLoginAt: admin.lastLoginAt,
      lastLoginIp: admin.lastLoginIp,
      createdAt: admin.createdAt,
      createdBy: admin.createdBy?.fullName ?? null,
      activeSessions: admin._count.sessions,
      currentSessionId: currentSessionId ?? null,
      ...summarizeRoles(
        admin.roles.map((r) => ({
          role: {
            key: r.role.key,
            name: r.role.name,
            description: r.role.description,
          },
        })),
      ),
      permissions: permissionDetails.map((p) => p.key),
      permissionDetails,
      // حساب ورود نماینده فروش — پنل بر اساس این فیلد پرتال نماینده را نشان می‌دهد
      agent: admin.agent,
    };
  }

  // ══════════════════════════════════════════
  // ── پروفایل شخصی ادمین ──
  // ══════════════════════════════════════════

  async updateOwnProfile(
    adminUserId: string,
    dto: { fullName?: string; phone?: string | null },
    ip?: string,
    userAgent?: string,
  ) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
    });
    if (!admin) throw new NotFoundException('ادمین یافت نشد');

    const data: { fullName?: string; phone?: string | null } = {};
    if (dto.fullName !== undefined) {
      const fullName = dto.fullName.trim();
      if (fullName.length < 3) {
        throw new BadRequestException('نام و نام خانوادگی حداقل ۳ کاراکتر است');
      }
      data.fullName = fullName;
    }
    if (dto.phone !== undefined) {
      const phone = (dto.phone ?? '').trim();
      if (phone && !/^09\d{9}$/.test(phone)) {
        throw new BadRequestException(
          'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود',
        );
      }
      data.phone = phone || null;
    }

    const updated = await this.prisma.adminUser.update({
      where: { id: adminUserId },
      data,
    });

    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.update_profile',
      entityType: 'admin_user',
      entityId: adminUserId,
      oldValue: { fullName: admin.fullName, phone: admin.phone },
      newValue: { fullName: updated.fullName, phone: updated.phone },
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });

    return {
      message: 'اطلاعات پروفایل به‌روزرسانی شد',
      fullName: updated.fullName,
      phone: updated.phone,
    };
  }

  /** نشست‌های فعال خودِ ادمین (دستگاه‌ها) */
  async listOwnSessions(adminUserId: string, currentSessionId: string) {
    const sessions = await this.prisma.adminSession.findMany({
      where: { adminUserId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    return sessions.map((s) => ({ ...s, current: s.id === currentSessionId }));
  }

  async revokeOwnSession(
    adminUserId: string,
    sessionId: string,
    currentSessionId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const session = await this.prisma.adminSession.findUnique({
      where: { id: sessionId },
    });
    // نشست متعلق به ادمین دیگر عمداً «یافت نشد» گزارش می‌شود (عدم افشای وجود)
    if (!session || session.adminUserId !== adminUserId) {
      throw new NotFoundException('نشست یافت نشد');
    }
    await this.prisma.adminSession.delete({ where: { id: sessionId } });
    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.revoke_session',
      entityType: 'admin_session',
      entityId: sessionId,
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return {
      message: 'نشست با موفقیت خاتمه یافت',
      current: sessionId === currentSessionId,
    };
  }

  /** خروج از همه‌ی دستگاه‌ها به‌جز دستگاه فعلی */
  async revokeOtherSessions(
    adminUserId: string,
    currentSessionId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const { count } = await this.prisma.adminSession.deleteMany({
      where: { adminUserId, id: { not: currentSessionId } },
    });
    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.revoke_other_sessions',
      newValue: { revoked: count },
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    return { message: `${count} نشست دیگر خاتمه یافت`, revoked: count };
  }

  /** تاریخچه‌ی فعالیت‌های خودِ ادمین (ورودها، تغییرات و عملیات) */
  async listOwnActivity(
    adminUserId: string,
    query: { page?: number; limit?: number; onlyAuth?: boolean },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 20));
    const where = {
      adminUserId,
      ...(query.onlyAuth ? { action: { startsWith: 'admin_auth.' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          ip: true,
          userAgent: true,
          success: true,
          createdAt: true,
        },
      }),
      this.prisma.adminAuditLog.count({ where }),
    ]);
    return {
      data: items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  private async createSession(
    adminUserId: string,
    ip?: string,
    userAgent?: string,
  ) {
    const sessionId = crypto.randomUUID();
    // عمر نشست از تنظیمات سیستم (session.admin.*) — expiresIn پاسخ مبنای maxAge کوکی در BFF است
    const { accessTtlSeconds, refreshTtlSeconds } =
      await this.systemConfig.getSessionPolicy('admin');

    const accessToken = this.jwtService.sign(
      { sub: adminUserId, sessionId },
      {
        ...jwtSignOptions('JWT_ADMIN_SECRET'),
        expiresIn: accessTtlSeconds,
      },
    );
    const refreshToken = this.jwtService.sign(
      { sub: adminUserId, sessionId },
      {
        ...jwtSignOptions('JWT_ADMIN_REFRESH_SECRET'),
        expiresIn: refreshTtlSeconds,
      },
    );

    const refreshHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');
    const expiresAt = new Date(Date.now() + refreshTtlSeconds * 1000);

    await this.prisma.adminSession.create({
      data: {
        id: sessionId,
        adminUserId,
        ip,
        userAgent,
        refreshTokenHash: refreshHash,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessTtlSeconds,
      refreshExpiresIn: refreshTtlSeconds,
    };
  }
  async changeOwnPassword(
    adminUserId: string,
    currentPassword: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
    });
    if (!admin) throw new NotFoundException('ادمین یافت نشد');

    const throttleKey = `pwchange:${adminUserId}`;
    await this.loginThrottle.assertAllowed('mfa', throttleKey, ip);
    const current = await verifyPassword(currentPassword, admin.passwordHash);
    if (!current.valid) {
      await this.loginThrottle.recordFailure('mfa', throttleKey, ip);
      await this.auditService.logAdmin({
        adminUserId,
        action: 'admin_auth.change_password',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'invalid_current_password' },
      });
      throw new UnauthorizedException('رمز عبور فعلی نادرست است');
    }
    await this.loginThrottle.recordSuccess('mfa', throttleKey);
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد',
      );
    }
    // FIA_UAU_EXT.1.1/1.4/1.5/1.11/1.12: سیاست واحد — بدون قاعده‌ی ترکیب کاراکتر
    await this.passwordPolicy.assertAcceptable(newPassword, 'admin', {
      username: admin.username,
      fullName: admin.fullName,
      phone: admin.phone,
    });

    await this.prisma.adminUser.update({
      where: { id: adminUserId },
      data: {
        passwordHash: await hashPassword(newPassword),
        mustChangePassword: false,
        passwordExpiresAt: null,
        passwordChangedAt: new Date(),
      },
    });

    // همه‌ی نشست‌ها باطل و ادمین باید دوباره (با رمز جدید + TOTP) وارد شود
    await this.prisma.adminSession.deleteMany({ where: { adminUserId } });

    this.logger.log(
      `[AdminAuth] رمز عبور توسط خودِ ادمین ${admin.username} تغییر یافت`,
    );
    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.change_password',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    await this.loginAlerts.onSecurityChange(
      this.alertOwner(admin),
      'رمز عبور تغییر کرد و همه‌ی نشست‌ها بسته شدند',
    );

    return { message: 'رمز عبور با موفقیت تغییر یافت. لطفاً دوباره وارد شوید' };
  }

  // ══════════════════════════════════════════
  // ── ورود دومرحله‌ای خودِ ادمین (FIA_UAU_EXT.3.6) ──
  // ══════════════════════════════════════════

  async ownMfaStatus(adminUserId: string) {
    const owner = { kind: 'admin' as const, id: adminUserId };
    return {
      ...(await this.mfa.status(owner)),
      required: true,
      devices: await this.loginAlerts.listDevices(owner),
    };
  }

  private async requireOwnCode(
    adminUserId: string,
    code: string,
    action: string,
    ip?: string,
    userAgent?: string,
  ) {
    const key = `admin:${adminUserId}`;
    await this.loginThrottle.assertAllowed('mfa', key, ip);
    const used = await this.mfa.verify(
      { kind: 'admin', id: adminUserId },
      code,
    );
    if (!used) {
      await this.loginThrottle.recordFailure('mfa', key, ip);
      await this.auditService.logAdmin({
        adminUserId,
        action,
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'invalid_code' },
      });
      throw new BadRequestException(
        'کد برنامه‌ی احراز هویت یا کد بازیابی نادرست است',
      );
    }
    await this.loginThrottle.recordSuccess('mfa', key);
  }

  async regenerateOwnRecoveryCodes(
    adminUserId: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.requireOwnCode(
      adminUserId,
      code,
      'admin_auth.mfa_recovery_codes',
      ip,
      userAgent,
    );
    const recoveryCodes = await this.mfa.regenerateRecoveryCodes({
      kind: 'admin',
      id: adminUserId,
    });
    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.mfa_recovery_codes_regenerated',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: adminUserId },
    });
    await this.loginAlerts.onSecurityChange(
      this.alertOwner(admin),
      'کدهای بازیابی جدید ساخته شد و کدهای قبلی باطل شدند',
    );
    return { recoveryCodes };
  }

  /** جایگزینی برنامه‌ی احراز هویت (گوشی جدید) — نیازمند کد فعلی یا کد بازیابی */
  async beginOwnMfaReconfigure(
    adminUserId: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    await this.requireOwnCode(
      adminUserId,
      code,
      'admin_auth.mfa_reconfigure',
      ip,
      userAgent,
    );
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: adminUserId },
    });
    return this.mfa.beginSetup(
      { kind: 'admin', id: adminUserId },
      admin.username,
    );
  }

  async confirmOwnMfaReconfigure(
    adminUserId: string,
    code: string,
    ip?: string,
    userAgent?: string,
  ) {
    const recoveryCodes = await this.mfa.confirmSetup(
      { kind: 'admin', id: adminUserId },
      code,
    );
    await this.auditService.logAdmin({
      adminUserId,
      action: 'admin_auth.mfa_reconfigured',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: adminUserId },
    });
    await this.loginAlerts.onSecurityChange(
      this.alertOwner(admin),
      'برنامه‌ی احراز هویت روی دستگاه جدید ثبت شد؛ دستگاه قبلی دیگر معتبر نیست',
    );
    return { recoveryCodes };
  }
}
