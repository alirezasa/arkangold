// api/src/admin-auth/admin-roles.util.ts
// ادمین می‌تواند هم‌زمان چند نقش داشته باشد (مثلاً حسابدار + مدیر مالی + پشتیبانی)؛
// دسترسی نهایی او اجتماع دسترسی‌های همه‌ی نقش‌هایش است.
import { Prisma } from '../generated/prisma/client';

export const SUPER_ADMIN_ROLE_KEY = 'SUPER_ADMIN';

/** include استاندارد نقش‌های ادمین به‌همراه دسترسی‌های هر نقش */
export const ADMIN_ROLES_WITH_PERMISSIONS_INCLUDE = {
  roles: {
    orderBy: { assignedAt: 'asc' },
    include: {
      role: { include: { permissions: { include: { permission: true } } } },
    },
  },
} satisfies Prisma.AdminUserInclude;

/** include سبک: فقط مشخصات نقش‌ها */
export const ADMIN_ROLES_INCLUDE = {
  roles: {
    orderBy: { assignedAt: 'asc' },
    include: { role: { select: { id: true, key: true, name: true } } },
  },
} satisfies Prisma.AdminUserInclude;

export interface RoleLike {
  key: string;
  name: string;
}

export interface PermissionLike {
  key: string;
  group: string;
  description: string | null;
}

/** فیلتر Prisma برای ادمین‌هایی که حداقل یکی از نقش‌های داده‌شده را دارند */
export function adminHasAnyRole(keys: string[]): Prisma.AdminUserWhereInput {
  return { roles: { some: { role: { key: { in: keys } } } } };
}

export function roleKeysOf(roles: { role: { key: string } }[]): string[] {
  return roles.map((r) => r.role.key);
}

/** نقش‌ها برای پاسخ API؛ نقش «اصلی» برای سازگاری با کلاینت‌های قدیمی اولین نقش است */
export function summarizeRoles<R extends RoleLike>(roles: { role: R }[]) {
  const list = roles.map((r) => r.role);
  const primary =
    list.find((r) => r.key === SUPER_ADMIN_ROLE_KEY) ?? list[0] ?? null;
  return {
    role: primary,
    roles: list,
  };
}

/** اجتماع (بدون تکرار) دسترسی‌های همه‌ی نقش‌ها */
export function mergePermissions(
  roles: {
    role: { permissions: { permission: PermissionLike }[] };
  }[],
): PermissionLike[] {
  const byKey = new Map<string, PermissionLike>();
  for (const r of roles) {
    for (const rp of r.role.permissions) {
      if (!byKey.has(rp.permission.key)) {
        byKey.set(rp.permission.key, {
          key: rp.permission.key,
          group: rp.permission.group,
          description: rp.permission.description,
        });
      }
    }
  }
  return [...byKey.values()];
}
