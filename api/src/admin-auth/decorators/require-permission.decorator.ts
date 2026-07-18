// api/src/admin-auth/decorators/require-permission.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from '../rbac.const';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';
export const RequirePermission = (...perms: PermissionKey[]) =>
  SetMetadata(REQUIRE_PERMISSION_KEY, perms);
