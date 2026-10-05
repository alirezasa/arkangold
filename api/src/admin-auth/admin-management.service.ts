// api/src/admin-auth/admin-management.service.ts
import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/crypto/password.util';
import { SmsTemplateService } from '../notifications/sms-template.service';
import { LoginThrottleService } from '../common/auth-security/login-throttle.service';
import { MfaService } from '../common/mfa/mfa.service';
import { maskPhone } from '../common/audit/mask.util';
import { isOtpDebugLogEnabled } from '../common/logging/otp-debug';
import {
  TEMP_PASSWORD_TTL_HOURS,
  assertUsernameAllowed,
  generateTempPassword,
} from '../common/auth-security/account-hygiene';
import type { Prisma } from '../generated/prisma/client';
import { ADMIN_ROLES, AGENT_ROLE_KEY } from './rbac.const';
import {
  ADMIN_ROLES_INCLUDE,
  SUPER_ADMIN_ROLE_KEY as SUPER_ADMIN,
  adminHasAnyRole,
  roleKeysOf,
  summarizeRoles,
} from './admin-roles.util';

const SYSTEM_ROLE_KEYS = new Set<string>(ADMIN_ROLES.map((r) => r.key));

/** ادمینی که عملیات را انجام می‌دهد (برای جلوگیری از ارتقای سطح دسترسی) */
export interface AdminActor {
  adminUserId: string;
  roleKeys: string[];
  permissions: string[];
}

const isSuperAdmin = (actor: AdminActor) =>
  actor.roleKeys.includes(SUPER_ADMIN);

interface RoleInput {
  key?: string;
  name?: string;
  description?: string;
  permissionKeys?: string[];
}

interface CreateAdminDto {
  username: string;
  fullName: string;
  /** یک یا چند نقش؛ roleKey برای سازگاری با کلاینت‌های قدیمی پذیرفته می‌شود */
  roleKeys?: string[];
  roleKey?: string;
  phone: string;
}

const ADMIN_PANEL_URL = process.env.ADMIN_PANEL_URL || 'admin.arkan.gold';
const AGENT_PANEL_URL = process.env.AGENT_PANEL_URL || 'panel.arkan.gold';

/**
 * FIA_UID_EXT.1.1 و 1.6: رمز اولیه/بازنشانی‌شده‌ی حساب‌های پنل را سیستم با CSPRNG می‌سازد و فقط به
 * موبایل خودِ صاحب حساب پیامک می‌کند؛ مدیر سیستم آن را نه انتخاب می‌کند و نه می‌بیند. رمز موقت
 * ۲۴ ساعت اعتبار دارد و در اولین ورود باید تغییر کند.
 */
export async function issueTempPassword(
  deps: {
    prisma: PrismaService | Prisma.TransactionClient;
    sms: SmsTemplateService;
    logger: Logger;
  },
  target: {
    id: string;
    username: string;
    fullName: string;
    phone: string | null;
    agentId: string | null;
  },
): Promise<{ maskedPhone: string; expiresAt: Date }> {
  if (!target.phone) {
    throw new BadRequestException(
      'برای ارسال رمز موقت، ابتدا شماره موبایل این حساب را ثبت کنید',
    );
  }
  const tempPassword = generateTempPassword();
  const expiresAt = new Date(Date.now() + TEMP_PASSWORD_TTL_HOURS * 3600_000);
  if (isOtpDebugLogEnabled()) {
    deps.logger.warn(`[TempPassword] ${target.username}: ${tempPassword}`);
  }
  try {
    await deps.sms.send(
      'ADMIN_TEMP_PASSWORD',
      target.phone,
      {
        name: target.fullName,
        username: target.username,
        tempPassword,
        hours: TEMP_PASSWORD_TTL_HOURS.toLocaleString('fa-IR'),
        panelUrl: target.agentId ? AGENT_PANEL_URL : ADMIN_PANEL_URL,
      },
      {
        throwOnFailure: true,
        referenceType: 'ADMIN_TEMP_PASSWORD',
        referenceId: target.id,
      },
    );
  } catch (err) {
    deps.logger.error(
      `ارسال رمز موقت به ${maskPhone(target.phone)} ناموفق بود: ${(err as Error).message}`,
    );
    throw new ServiceUnavailableException(
      'ارسال پیامک رمز موقت ناموفق بود؛ تغییری اعمال نشد. لحظاتی دیگر دوباره تلاش کنید',
    );
  }
  await deps.prisma.adminUser.update({
    where: { id: target.id },
    data: {
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      passwordExpiresAt: expiresAt,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await deps.prisma.adminSession.deleteMany({
    where: { adminUserId: target.id },
  });
  return { maskedPhone: maskPhone(target.phone) ?? '', expiresAt };
}

interface UpdateAdminDto {
  fullName?: string;
  roleKeys?: string[];
  roleKey?: string;
  isActive?: boolean;
  phone?: string;
}

@Injectable()
export class AdminManagementService {
  private readonly logger = new Logger(AdminManagementService.name);

  constructor(
    private prisma: PrismaService,
    private sms: SmsTemplateService,
    private loginThrottle: LoginThrottleService,
    private mfa: MfaService,
  ) {}

  async list() {
    const now = new Date();
    const admins = await this.prisma.adminUser.findMany({
      include: {
        ...ADMIN_ROLES_INCLUDE,
        createdBy: { select: { fullName: true } },
        _count: { select: { sessions: { where: { expiresAt: { gt: now } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return admins.map((a) => ({
      id: a.id,
      username: a.username,
      fullName: a.fullName,
      phone: a.phone,
      isActive: a.isActive,
      totpEnabled: a.totpEnabled,
      mustChangePassword: a.mustChangePassword,
      passwordExpiresAt: a.passwordExpiresAt,
      ...summarizeRoles(a.roles),
      lastLoginAt: a.lastLoginAt,
      lastLoginIp: a.lastLoginIp,
      isLocked: !!a.lockedUntil && a.lockedUntil > now,
      lockedUntil: a.lockedUntil,
      failedLoginCount: a.failedLoginCount,
      activeSessions: a._count.sessions,
      createdBy: a.createdBy?.fullName ?? null,
      createdAt: a.createdAt,
    }));
  }

  async listRoles() {
    const roles = await this.prisma.adminRole.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return roles.map(({ _count, permissions, ...r }) => ({
      ...r,
      userCount: _count.users,
      permissions: permissions.map((rp) => ({
        key: rp.permission.key,
        group: rp.permission.group,
        description: rp.permission.description,
      })),
    }));
  }

  async listPermissions() {
    return this.prisma.adminPermission.findMany({
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
      select: { key: true, group: true, description: true },
    });
  }

  // ══════════════════════════════════════════
  // ── مدیریت نقش‌های سفارشی ──
  // نقش‌های سیستمی در هر استارت از rbac.const همگام می‌شوند و قابل ویرایش/حذف نیستند
  // ══════════════════════════════════════════

  /** ادمین غیر مدیر ارشد نمی‌تواند دسترسی‌ای بدهد که خودش ندارد */
  private assertCanGrant(actor: AdminActor, permissionKeys: string[]) {
    if (isSuperAdmin(actor)) return;
    const missing = permissionKeys.filter(
      (k) => !actor.permissions.includes(k),
    );
    if (missing.length > 0) {
      throw new ForbiddenException(
        'امکان اعطای دسترسی‌هایی که خودتان ندارید وجود ندارد',
      );
    }
  }

  private async resolvePermissionIds(permissionKeys: string[]) {
    const unique = [...new Set(permissionKeys)];
    const permissions = await this.prisma.adminPermission.findMany({
      where: { key: { in: unique } },
      select: { id: true, key: true },
    });
    if (permissions.length !== unique.length) {
      throw new BadRequestException(
        'برخی از دسترسی‌های انتخاب‌شده نامعتبر هستند',
      );
    }
    return permissions.map((p) => p.id);
  }

  async createRole(actor: AdminActor, dto: RoleInput) {
    const key = (dto.key ?? '').trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9_]{2,39}$/.test(key)) {
      throw new BadRequestException(
        'کلید نقش باید با حروف انگلیسی بزرگ شروع شود و فقط شامل حروف، عدد و _ باشد (۳ تا ۴۰ کاراکتر)',
      );
    }
    if (SYSTEM_ROLE_KEYS.has(key)) {
      throw new ConflictException('این کلید متعلق به نقش‌های سیستمی است');
    }
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('نام نقش را وارد کنید');
    const permissionKeys = dto.permissionKeys ?? [];
    if (permissionKeys.length === 0) {
      throw new BadRequestException('حداقل یک دسترسی برای نقش انتخاب کنید');
    }
    this.assertCanGrant(actor, permissionKeys);

    const existing = await this.prisma.adminRole.findUnique({ where: { key } });
    if (existing) throw new ConflictException('نقشی با این کلید وجود دارد');

    const permissionIds = await this.resolvePermissionIds(permissionKeys);
    return this.prisma.adminRole.create({
      data: {
        key,
        name,
        description: dto.description?.trim() || null,
        isSystem: false,
        permissions: {
          create: permissionIds.map((permissionId) => ({ permissionId })),
        },
      },
    });
  }

  async updateRole(actor: AdminActor, roleId: string, dto: RoleInput) {
    const role = await this.prisma.adminRole.findUnique({
      where: { id: roleId },
    });
    if (!role) throw new NotFoundException('نقش یافت نشد');
    if (role.isSystem || SYSTEM_ROLE_KEYS.has(role.key)) {
      throw new ForbiddenException('نقش‌های سیستمی قابل ویرایش نیستند');
    }

    let permissionIds: string[] | undefined;
    if (dto.permissionKeys) {
      if (dto.permissionKeys.length === 0) {
        throw new BadRequestException('حداقل یک دسترسی برای نقش انتخاب کنید');
      }
      this.assertCanGrant(actor, dto.permissionKeys);
      permissionIds = await this.resolvePermissionIds(dto.permissionKeys);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.adminRole.update({
        where: { id: roleId },
        data: {
          name: dto.name?.trim() || undefined,
          description:
            dto.description === undefined
              ? undefined
              : dto.description.trim() || null,
        },
      });
      if (permissionIds) {
        await tx.adminRolePermission.deleteMany({ where: { roleId } });
        await tx.adminRolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
        });
      }
    });
    return { message: 'نقش با موفقیت بروزرسانی شد' };
  }

  async deleteRole(roleId: string) {
    const role = await this.prisma.adminRole.findUnique({
      where: { id: roleId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException('نقش یافت نشد');
    if (role.isSystem || SYSTEM_ROLE_KEYS.has(role.key)) {
      throw new ForbiddenException('نقش‌های سیستمی قابل حذف نیستند');
    }
    if (role._count.users > 0) {
      throw new BadRequestException(
        'این نقش به ادمین‌هایی اختصاص داده شده است؛ ابتدا نقش آن‌ها را تغییر دهید',
      );
    }
    await this.prisma.adminRole.delete({ where: { id: roleId } });
    return { message: 'نقش حذف شد' };
  }

  /** ادمین غیر مدیر ارشد نمی‌تواند حساب مدیر ارشد را تغییر دهد (رمز، نقش، وضعیت، نشست) */
  private assertCanManageTarget(actor: AdminActor, targetRoleKeys: string[]) {
    if (targetRoleKeys.includes(SUPER_ADMIN) && !isSuperAdmin(actor)) {
      throw new ForbiddenException(
        'فقط مدیر ارشد می‌تواند حساب مدیر ارشد را مدیریت کند',
      );
    }
  }

  /** لیست نقش‌های درخواستی (roleKeys یا roleKey قدیمی) بدون تکرار */
  private normalizeRoleKeys(dto: {
    roleKeys?: string[];
    roleKey?: string;
  }): string[] | undefined {
    const raw = dto.roleKeys ?? (dto.roleKey ? [dto.roleKey] : undefined);
    if (!raw) return undefined;
    const keys = [...new Set(raw.map((k) => k.trim()).filter(Boolean))];
    if (keys.length === 0) {
      throw new BadRequestException('حداقل یک نقش برای ادمین انتخاب کنید');
    }
    return keys;
  }

  /**
   * نقش‌ها را پیدا و مجوز اختصاصشان را بررسی می‌کند:
   * - فقط مدیر ارشد می‌تواند نقش مدیر ارشد را اختصاص دهد
   * - ادمین غیر مدیر ارشد نمی‌تواند (با مجموع نقش‌ها) دسترسی‌ای بدهد که خودش ندارد
   * - نقش «نماینده فروش» مخصوص حساب‌های نماینده است و با نقش دیگری ترکیب نمی‌شود
   */
  private async resolveAssignableRoles(actor: AdminActor, roleKeys: string[]) {
    const roles = await this.prisma.adminRole.findMany({
      where: { key: { in: roleKeys } },
      include: { permissions: { include: { permission: true } } },
    });
    if (roles.length !== roleKeys.length) {
      throw new NotFoundException('برخی از نقش‌های انتخاب‌شده یافت نشدند');
    }
    if (roleKeys.includes(AGENT_ROLE_KEY)) {
      throw new BadRequestException(
        'نقش «نماینده فروش» فقط از بخش نمایندگان و برای حساب نماینده قابل تعریف است',
      );
    }
    if (roleKeys.includes(SUPER_ADMIN) && !isSuperAdmin(actor)) {
      throw new ForbiddenException(
        'فقط مدیر ارشد می‌تواند نقش مدیر ارشد را اختصاص دهد',
      );
    }
    this.assertCanGrant(
      actor,
      roles.flatMap((r) => r.permissions.map((rp) => rp.permission.key)),
    );
    // ترتیب نقش‌ها مطابق انتخاب کاربر حفظ می‌شود
    return roleKeys.map((k) => roles.find((r) => r.key === k));
  }

  // ══════════════════════════════════════════
  // ── مدیریت نشست‌ها و قفل حساب ادمین ──
  // ══════════════════════════════════════════
  async revokeSessions(actor: AdminActor, targetId: string) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: ADMIN_ROLES_INCLUDE,
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    this.assertCanManageTarget(actor, roleKeysOf(target.roles));
    if (actor.adminUserId === targetId) {
      throw new BadRequestException(
        'برای خروج از نشست‌های خودتان از بخش پروفایل استفاده کنید',
      );
    }
    const { count } = await this.prisma.adminSession.deleteMany({
      where: { adminUserId: targetId },
    });
    return { message: 'همه نشست‌های این ادمین بسته شد', count };
  }

  async unlock(actor: AdminActor, targetId: string) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: ADMIN_ROLES_INCLUDE,
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    this.assertCanManageTarget(actor, roleKeysOf(target.roles));
    await this.prisma.adminUser.update({
      where: { id: targetId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    await this.loginThrottle.clear('admin', target.username);
    await this.loginThrottle.clear('mfa', `admin:${target.id}`);
    return { message: 'قفل حساب ادمین برداشته شد' };
  }

  async create(actor: AdminActor, dto: CreateAdminDto) {
    const creatorId = actor.adminUserId;
    const username = dto.username.trim();
    // FIA_UAU_EXT.2.2: نام‌های پیش‌فرض/قابل حدس (admin، root، test …) مجاز نیستند
    assertUsernameAllowed(username);

    const existing = await this.prisma.adminUser.findUnique({
      where: { username },
    });
    if (existing)
      throw new ConflictException('این نام کاربری قبلاً استفاده شده است');

    const roleKeys = this.normalizeRoleKeys(dto);
    if (!roleKeys) {
      throw new BadRequestException('حداقل یک نقش برای ادمین انتخاب کنید');
    }
    const roles = await this.resolveAssignableRoles(actor, roleKeys);

    // ساخت حساب و ارسال پیامک رمز موقت در یک تراکنش: اگر پیامک نرسد حسابی ساخته نمی‌شود
    const { admin, delivery } = await this.prisma.$transaction(
      async (tx) => {
        const admin = await tx.adminUser.create({
          data: {
            username,
            // تا پیش از ارسال رمز موقت، رمز تصادفی غیرقابل‌استفاده
            passwordHash: await hashPassword(
              generateTempPassword() + generateTempPassword(),
            ),
            fullName: dto.fullName,
            phone: dto.phone,
            createdById: creatorId,
            mustChangePassword: true,
            roles: { create: roles.map((r) => ({ roleId: r.id })) },
          },
          include: ADMIN_ROLES_INCLUDE,
        });
        const delivery = await issueTempPassword(
          { prisma: tx, sms: this.sms, logger: this.logger },
          admin,
        );
        return { admin, delivery };
      },
      { timeout: 30_000 },
    );

    return {
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      phone: admin.phone,
      ...summarizeRoles(admin.roles),
      message: `حساب ساخته شد و رمز موقت (۲۴ ساعته) به ${delivery.maskedPhone} پیامک شد`,
      tempPasswordExpiresAt: delivery.expiresAt,
    };
  }

  async update(actor: AdminActor, targetId: string, dto: UpdateAdminDto) {
    const actorId = actor.adminUserId;
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: ADMIN_ROLES_INCLUDE,
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');

    const currentKeys = roleKeysOf(target.roles);
    this.assertCanManageTarget(actor, currentKeys);

    const requestedKeys = this.normalizeRoleKeys(dto);
    const rolesChanged =
      !!requestedKeys &&
      (requestedKeys.length !== currentKeys.length ||
        requestedKeys.some((k) => !currentKeys.includes(k)));

    // جلوگیری از غیرفعال کردن یا تغییر نقش‌های خودِ فرد (باید یک SUPER_ADMIN دیگر این کار را بکند)
    if (actorId === targetId && (dto.isActive === false || rolesChanged)) {
      throw new ForbiddenException(
        'امکان تغییر نقش یا غیرفعال کردن حساب خودتان وجود ندارد',
      );
    }

    // حساب ورود نماینده فقط نقش «نماینده فروش» دارد و از اینجا تغییر نمی‌کند
    if (
      rolesChanged &&
      (target.agentId || currentKeys.includes(AGENT_ROLE_KEY))
    ) {
      throw new BadRequestException(
        'نقش حساب ورود نماینده قابل تغییر نیست؛ از بخش نمایندگان استفاده کنید',
      );
    }

    let newRoles: { id: string; key: string }[] | undefined;
    if (rolesChanged && requestedKeys) {
      // فقط نقش‌های تازه افزوده‌شده نیاز به بررسی مجوز اعطا دارند
      const addedKeys = requestedKeys.filter((k) => !currentKeys.includes(k));
      if (addedKeys.length > 0) {
        await this.resolveAssignableRoles(actor, addedKeys);
      }
      newRoles = await this.prisma.adminRole.findMany({
        where: { key: { in: requestedKeys } },
        select: { id: true, key: true },
      });
      if (newRoles.length !== requestedKeys.length) {
        throw new NotFoundException('برخی از نقش‌های انتخاب‌شده یافت نشدند');
      }
    }

    // اگر آخرین SUPER_ADMIN فعال است، اجازه غیرفعال‌سازی یا حذف نقش مدیر ارشد را نده
    if (
      currentKeys.includes(SUPER_ADMIN) &&
      (dto.isActive === false ||
        (rolesChanged && !requestedKeys.includes(SUPER_ADMIN)))
    ) {
      const activeSuperAdmins = await this.prisma.adminUser.count({
        where: { ...adminHasAnyRole([SUPER_ADMIN]), isActive: true },
      });
      if (activeSuperAdmins <= 1) {
        throw new ForbiddenException(
          'نمی‌توانید آخرین مدیر ارشد فعال سیستم را غیرفعال یا تنزل دهید',
        );
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (newRoles) {
        await tx.adminUserRole.deleteMany({ where: { adminUserId: targetId } });
        await tx.adminUserRole.createMany({
          data: requestedKeys.map((key, i) => ({
            adminUserId: targetId,
            roleId: newRoles.find((r) => r.key === key).id,
            assignedAt: new Date(Date.now() + i),
          })),
        });
      }
      return tx.adminUser.update({
        where: { id: targetId },
        data: {
          fullName: dto.fullName,
          phone: dto.phone,
          isActive: dto.isActive,
        },
        include: ADMIN_ROLES_INCLUDE,
      });
    });

    // اگر غیرفعال شد یا نقش‌هایش عوض شد، همه نشست‌هایش را باطل کن
    if (dto.isActive === false || rolesChanged) {
      await this.prisma.adminSession.deleteMany({
        where: { adminUserId: targetId },
      });
    }

    return {
      id: updated.id,
      username: updated.username,
      fullName: updated.fullName,
      phone: updated.phone,
      isActive: updated.isActive,
      ...summarizeRoles(updated.roles),
    };
  }

  /** FIA_UID_EXT.1.6: مدیر فقط بازنشانی را آغاز می‌کند؛ رمز موقت را نمی‌بیند و انتخاب نمی‌کند */
  async resetPassword(actor: AdminActor, targetId: string) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: ADMIN_ROLES_INCLUDE,
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    this.assertCanManageTarget(actor, roleKeysOf(target.roles));
    const delivery = await issueTempPassword(
      { prisma: this.prisma, sms: this.sms, logger: this.logger },
      target,
    );
    await this.loginThrottle.clear('admin', target.username);
    return {
      message: `رمز موقت (۲۴ ساعته) به ${delivery.maskedPhone} پیامک شد؛ همه‌ی نشست‌های این حساب بسته شد`,
      tempPasswordExpiresAt: delivery.expiresAt,
    };
  }

  /**
   * FIA_UID_EXT.1.4 و FIA_UAU_EXT.3.6: ابطال فوری عامل دوم (گم شدن/سرقت گوشی). بازیابی به همان
   * اندازه‌ی ثبت اولیه امن است: رمز موقت جدید فقط به موبایل ثبت‌شده پیامک می‌شود و صاحب حساب
   * باید پس از تغییر رمز، برنامه‌ی احراز هویت را از نو راه‌اندازی کند. همه‌ی نشست‌ها بسته می‌شوند.
   */
  async resetMfa(actor: AdminActor, targetId: string) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: ADMIN_ROLES_INCLUDE,
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    this.assertCanManageTarget(actor, roleKeysOf(target.roles));
    if (actor.adminUserId === targetId) {
      throw new ForbiddenException(
        'ورود دومرحله‌ای حساب خودتان را از پروفایل مدیریت کنید؛ بازنشانی باید توسط مدیر دیگری انجام شود',
      );
    }
    if (!target.phone) {
      throw new BadRequestException(
        'برای بازنشانی ورود دومرحله‌ای، ابتدا شماره موبایل این حساب را ثبت کنید',
      );
    }
    const delivery = await issueTempPassword(
      { prisma: this.prisma, sms: this.sms, logger: this.logger },
      target,
    );
    await this.mfa.disable({ kind: 'admin', id: target.id });
    await this.loginThrottle.clear('mfa', `admin:${target.id}`);
    return {
      message: `ورود دومرحله‌ای این حساب باطل شد. رمز موقت به ${delivery.maskedPhone} پیامک شد و صاحب حساب در ورود بعدی برنامه‌ی احراز هویت را دوباره راه‌اندازی می‌کند`,
    };
  }
}
