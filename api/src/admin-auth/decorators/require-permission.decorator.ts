// api/src/admin-auth/decorators/require-permission.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../rbac.const';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';
export const RequirePermission = (...perms: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, perms);

/**
 * FDP_ACC_EXT.2.1 — AdminPermissionGuard به‌صورت پیش‌فرض رد می‌کند؛ مسیری که عمداً برای هر
 * ادمین احرازشده (بدون دسترسی خاص) باز است — مثل مدیریت نشست‌ها یا رمز خود ادمین — باید
 * صریحاً با این دکوریتور علامت بخورد.
 */
export const ADMIN_SELF_SERVICE_KEY = 'adminSelfService';
export const AdminSelfService = () => SetMetadata(ADMIN_SELF_SERVICE_KEY, true);
