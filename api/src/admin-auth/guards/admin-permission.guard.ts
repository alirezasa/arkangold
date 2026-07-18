// api/src/admin-auth/guards/admin-permission.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionKey } from '../rbac.const';
import { AdminAuthenticatedUser } from '../interfaces/admin-jwt-payload.interface';

interface AdminRequest {
  user?: AdminAuthenticatedUser;
}

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AdminRequest>();
    const permissions = req.user?.permissions ?? [];

    const hasAll = required.every((p) => permissions.includes(p));
    if (!hasAll) {
      throw new ForbiddenException('شما دسترسی لازم برای این عملیات را ندارید');
    }
    return true;
  }
}
