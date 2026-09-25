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
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { jwtSignOptions } from '../common/secrets/jwt-keyring';
import { hashPassword } from '../common/crypto/password.util';
import { SystemConfigService } from '../system-config/system-config.service';

const AUDIT_SOURCE = 'AdminAuthService';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // ۱۵ دقیقه

interface LoginDto {
  username: string;
  password: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private auditService: AuditService,
    private systemConfig: SystemConfigService,
  ) {}

  async login(dto: LoginDto, ip?: string, userAgent?: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { username: dto.username },
      include: { role: true },
    });

    // پیام یکسان برای عدم افشای وجود/عدم وجود نام کاربری
    const invalidCredsMsg = 'نام کاربری یا رمز عبور نادرست است';

    if (!admin) {
      await this.auditService.logAdmin({
        adminUserId: null,
        actorLabel: maskUsername(dto.username),
        action: 'admin_auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
      });
      throw new UnauthorizedException(invalidCredsMsg);
    }

    if (admin.lockedUntil && admin.lockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (admin.lockedUntil.getTime() - Date.now()) / 60000,
      );
      await this.auditService.logAdmin({
        adminUserId: admin.id,
        action: 'admin_auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'locked' },
      });
      throw new ForbiddenException(
        `حساب شما به دلیل تلاش‌های ناموفق مکرر موقتاً قفل شده است. ${minutesLeft} دقیقه دیگر تلاش کنید`,
      );
    }

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

    const validPassword = await bcrypt.compare(
      dto.password,
      admin.passwordHash,
    );
    if (!validPassword) {
      await this.handleFailedLogin(
        admin.id,
        admin.failedLoginCount,
        ip,
        userAgent,
      );
      await this.auditService.logAdmin({
        adminUserId: admin.id,
        action: 'admin_auth.login',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: { reason: 'invalid_password' },
      });
      throw new UnauthorizedException(invalidCredsMsg);
    }

    // ── ورود موفق: ریست شمارنده تلاش ناموفق ──
    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ip,
      },
    });

    // TODO(2FA): وقتی totpEnabled فعال شد، اینجا باید به‌جای صدور مستقیم session
    // یک tempToken کوتاه‌مدت صادر شود و کاربر به verify-2fa هدایت شود.
    // فعلاً چون admin.totpEnabled همیشه false است، مستقیم session کامل صادر می‌شود.

    const tokens = await this.createSession(admin.id, ip, userAgent);

    this.logger.log(`[AdminAuth] ورود موفق: ${admin.username} از IP ${ip}`);
    await this.auditService.logAdmin({
      adminUserId: admin.id,
      action: 'admin_auth.login',
      ip,
      userAgent,
      source: AUDIT_SOURCE,
      success: true,
    });

    return {
      ...tokens,
      admin: {
        id: admin.id,
        username: admin.username,
        fullName: admin.fullName,
        role: { key: admin.role.key, name: admin.role.name },
      },
    };
  }

  private async handleFailedLogin(
    adminId: string,
    currentCount: number,
    ip?: string,
    userAgent?: string,
  ) {
    const newCount = currentCount + 1;
    const shouldLock = newCount >= MAX_FAILED_ATTEMPTS;

    await this.prisma.adminUser.update({
      where: { id: adminId },
      data: {
        failedLoginCount: newCount,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCK_DURATION_MS)
          : undefined,
      },
    });

    if (shouldLock) {
      this.logger.warn(
        `[AdminAuth] حساب ${adminId} به دلیل تلاش‌های ناموفق مکرر قفل شد`,
      );
      // FAU_GEN_EXT.1.5: قفل‌شدن حساب کاربری به دلیل تلاش‌های ناموفق مکرر
      await this.auditService.logAdmin({
        adminUserId: adminId,
        action: 'admin_auth.account_locked',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
        newValue: {
          failedAttempts: newCount,
          lockDurationMs: LOCK_DURATION_MS,
        },
      });
    }
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
        role: { include: { permissions: { include: { permission: true } } } },
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
      role: {
        key: admin.role.key,
        name: admin.role.name,
        description: admin.role.description,
      },
      permissions: admin.role.permissions.map((rp) => rp.permission.key),
      permissionDetails: admin.role.permissions.map((rp) => ({
        key: rp.permission.key,
        group: rp.permission.group,
        description: rp.permission.description,
      })),
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
    const sessionId = uuidv4();
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
    if (newPassword.length < 12) {
      throw new BadRequestException('رمز عبور جدید باید حداقل ۱۲ کاراکتر باشد');
    }
    if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      throw new BadRequestException(
        'رمز عبور جدید باید ترکیبی از حروف انگلیسی و عدد باشد',
      );
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException(
        'رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد',
      );
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: adminUserId },
    });
    if (!admin) throw new NotFoundException('ادمین یافت نشد');

    const validCurrent = await bcrypt.compare(
      currentPassword,
      admin.passwordHash,
    );
    if (!validCurrent) {
      await this.auditService.logAdmin({
        adminUserId,
        action: 'admin_auth.change_password',
        ip,
        userAgent,
        source: AUDIT_SOURCE,
        success: false,
      });
      throw new UnauthorizedException('رمز عبور فعلی نادرست است');
    }

    const newHash = await hashPassword(newPassword);
    await this.prisma.adminUser.update({
      where: { id: adminUserId },
      data: { passwordHash: newHash },
    });

    // به‌جز نشست فعلی، بقیه‌ی نشست‌ها باطل شوند (کاربر در همین نشست باقی می‌ماند)
    // توجه: چون sessionId فعلی را اینجا نداریم مگر پاس داده شود، برای سادگی همه نشست‌ها باطل و کاربر باید دوباره وارد شود
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

    return { message: 'رمز عبور با موفقیت تغییر یافت. لطفاً دوباره وارد شوید' };
  }
}
