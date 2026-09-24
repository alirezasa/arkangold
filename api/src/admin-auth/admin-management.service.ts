// api/src/admin-auth/admin-management.service.ts
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { hashPassword } from '../common/crypto/password.util';
import { ADMIN_ROLES } from './rbac.const';

const SUPER_ADMIN = 'SUPER_ADMIN';
const SYSTEM_ROLE_KEYS = new Set<string>(ADMIN_ROLES.map((r) => r.key));

/** ادمینی که عملیات را انجام می‌دهد (برای جلوگیری از ارتقای سطح دسترسی) */
export interface AdminActor {
  adminUserId: string;
  roleKey: string;
  permissions: string[];
}

interface RoleInput {
  key?: string;
  name?: string;
  description?: string;
  permissionKeys?: string[];
}

interface CreateAdminDto {
  username: string;
  password: string;
  fullName: string;
  roleKey: string;
  phone?: string;
}

interface UpdateAdminDto {
  fullName?: string;
  roleKey?: string;
  isActive?: boolean;
  phone?: string;
}

@Injectable()
export class AdminManagementService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const now = new Date();
    const admins = await this.prisma.adminUser.findMany({
      include: {
        role: true,
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
      role: { id: a.roleId, key: a.role.key, name: a.role.name },
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
    if (actor.roleKey === SUPER_ADMIN) return;
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
  private assertCanManageTarget(actor: AdminActor, targetRoleKey: string) {
    if (targetRoleKey === SUPER_ADMIN && actor.roleKey !== SUPER_ADMIN) {
      throw new ForbiddenException(
        'فقط مدیر ارشد می‌تواند حساب مدیر ارشد را مدیریت کند',
      );
    }
  }

  /** فقط مدیر ارشد می‌تواند نقش مدیر ارشد را اختصاص دهد */
  private assertCanAssignRole(actor: AdminActor, roleKey: string) {
    if (roleKey === SUPER_ADMIN && actor.roleKey !== SUPER_ADMIN) {
      throw new ForbiddenException(
        'فقط مدیر ارشد می‌تواند نقش مدیر ارشد را اختصاص دهد',
      );
    }
  }

  private async assertCanAssignRolePermissions(
    actor: AdminActor,
    roleId: string,
  ) {
    if (actor.roleKey === SUPER_ADMIN) return;
    const rolePermissions = await this.prisma.adminRolePermission.findMany({
      where: { roleId },
      include: { permission: { select: { key: true } } },
    });
    this.assertCanGrant(
      actor,
      rolePermissions.map((rp) => rp.permission.key),
    );
  }

  // ══════════════════════════════════════════
  // ── مدیریت نشست‌ها و قفل حساب ادمین ──
  // ══════════════════════════════════════════
  async revokeSessions(actor: AdminActor, targetId: string) {
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: { role: { select: { key: true } } },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    this.assertCanManageTarget(actor, target.role.key);
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
      include: { role: { select: { key: true } } },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    this.assertCanManageTarget(actor, target.role.key);
    await this.prisma.adminUser.update({
      where: { id: targetId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
    return { message: 'قفل حساب ادمین برداشته شد' };
  }

  async create(actor: AdminActor, dto: CreateAdminDto) {
    const creatorId = actor.adminUserId;
    if (dto.password.length < 12) {
      throw new BadRequestException('رمز عبور باید حداقل ۱۲ کاراکتر باشد');
    }

    const existing = await this.prisma.adminUser.findUnique({
      where: { username: dto.username },
    });
    if (existing)
      throw new ConflictException('این نام کاربری قبلاً استفاده شده است');

    const role = await this.prisma.adminRole.findUnique({
      where: { key: dto.roleKey },
    });
    if (!role) throw new NotFoundException('نقش انتخاب‌شده یافت نشد');
    this.assertCanAssignRole(actor, role.key);
    await this.assertCanAssignRolePermissions(actor, role.id);

    const passwordHash = await hashPassword(dto.password);
    const admin = await this.prisma.adminUser.create({
      data: {
        username: dto.username,
        passwordHash,
        fullName: dto.fullName,
        phone: dto.phone,
        roleId: role.id,
        createdById: creatorId,
      },
      include: { role: true },
    });

    return {
      id: admin.id,
      username: admin.username,
      fullName: admin.fullName,
      phone: admin.phone,
      role: { key: admin.role.key, name: admin.role.name },
    };
  }

  async update(actor: AdminActor, targetId: string, dto: UpdateAdminDto) {
    const actorId = actor.adminUserId;
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: { role: true },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');

    this.assertCanManageTarget(actor, target.role.key);

    // جلوگیری از غیرفعال کردن یا تنزل نقش خودِ فرد (باید یک SUPER_ADMIN دیگر این کار را بکند)
    if (actorId === targetId && (dto.isActive === false || dto.roleKey)) {
      throw new ForbiddenException(
        'امکان تغییر نقش یا غیرفعال کردن حساب خودتان وجود ندارد',
      );
    }

    let roleId: string | undefined;
    if (dto.roleKey) {
      const role = await this.prisma.adminRole.findUnique({
        where: { key: dto.roleKey },
      });
      if (!role) throw new NotFoundException('نقش انتخاب‌شده یافت نشد');
      this.assertCanAssignRole(actor, role.key);
      await this.assertCanAssignRolePermissions(actor, role.id);
      roleId = role.id;
    }

    // اگر آخرین SUPER_ADMIN فعال است، اجازه غیرفعال‌سازی یا تغییر نقشش را نده
    if (
      target.role.key === 'SUPER_ADMIN' &&
      (dto.isActive === false || (dto.roleKey && dto.roleKey !== 'SUPER_ADMIN'))
    ) {
      const activeSuperAdmins = await this.prisma.adminUser.count({
        where: { role: { key: 'SUPER_ADMIN' }, isActive: true },
      });
      if (activeSuperAdmins <= 1) {
        throw new ForbiddenException(
          'نمی‌توانید آخرین مدیر ارشد فعال سیستم را غیرفعال یا تنزل دهید',
        );
      }
    }

    const updated = await this.prisma.adminUser.update({
      where: { id: targetId },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        roleId,
        isActive: dto.isActive,
      },
      include: { role: true },
    });

    // اگر غیرفعال شد یا نقشش عوض شد، همه نشست‌هایش را باطل کن
    if (dto.isActive === false || dto.roleKey) {
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
      role: { key: updated.role.key, name: updated.role.name },
    };
  }

  async resetPassword(
    actor: AdminActor,
    targetId: string,
    newPassword: string,
  ) {
    if (newPassword.length < 12) {
      throw new BadRequestException('رمز عبور باید حداقل ۱۲ کاراکتر باشد');
    }
    const target = await this.prisma.adminUser.findUnique({
      where: { id: targetId },
      include: { role: { select: { key: true } } },
    });
    if (!target) throw new NotFoundException('ادمین یافت نشد');
    this.assertCanManageTarget(actor, target.role.key);

    const passwordHash = await hashPassword(newPassword);
    await this.prisma.adminUser.update({
      where: { id: targetId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    // ریست رمز یعنی همه نشست‌های فعلی باطل شوند
    await this.prisma.adminSession.deleteMany({
      where: { adminUserId: targetId },
    });

    return { message: 'رمز عبور با موفقیت بازنشانی شد' };
  }
}
