// api/src/admin-auth/rbac-sync.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ADMIN_PERMISSIONS, ADMIN_ROLES } from './rbac.const';

@Injectable()
export class RbacSyncService implements OnModuleInit {
  private readonly logger = new Logger(RbacSyncService.name);

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncPermissions();
    await this.syncRoles();
  }

  // ── همگام‌سازی permission ها با آنچه در کد تعریف شده ──
  private async syncPermissions() {
    for (const p of ADMIN_PERMISSIONS) {
      await this.prisma.adminPermission.upsert({
        where: { key: p.key },
        create: { key: p.key, group: p.group, description: p.description },
        update: { group: p.group, description: p.description },
      });
    }
    this.logger.log(
      `[RBAC] ${ADMIN_PERMISSIONS.length} permission همگام‌سازی شد`,
    );
  }

  // ── همگام‌سازی نقش‌ها + اتصال permission ها ──
  private async syncRoles() {
    const allPermissions = await this.prisma.adminPermission.findMany();
    const permissionMap = new Map(allPermissions.map((p) => [p.key, p.id]));

    for (const r of ADMIN_ROLES) {
      const role = await this.prisma.adminRole.upsert({
        where: { key: r.key },
        create: {
          key: r.key,
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
        },
        update: {
          name: r.name,
          description: r.description,
          isSystem: r.isSystem,
        },
      });

      const targetPermissionIds: string[] =
        r.permissions === 'ALL'
          ? allPermissions.map((p) => p.id)
          : r.permissions
              .map((key) => permissionMap.get(key))
              .filter((id): id is string => !!id);

      // حذف اتصالات قدیمی که دیگر در کد نیستند + افزودن جدیدها (idempotent)
      await this.prisma.adminRolePermission.deleteMany({
        where: {
          roleId: role.id,
          permissionId: { notIn: targetPermissionIds },
        },
      });

      await this.prisma.adminRolePermission.createMany({
        data: targetPermissionIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
        })),
        skipDuplicates: true,
      });
    }

    this.logger.log(`[RBAC] ${ADMIN_ROLES.length} نقش همگام‌سازی شد`);
  }
}
