// api/src/admin-auth/guards/admin-permission.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { REQUIRE_PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { PermissionKey } from '../rbac.const';
import { AdminAuthenticatedUser } from '../interfaces/admin-jwt-payload.interface';
import { AuditService } from '../../common/audit/audit.service';

interface AdminRequest extends Request {
  user?: AdminAuthenticatedUser;
}

@Injectable()
export class AdminPermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

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
      // FAU_GEN_EXT.1.6: تلاش ناموفق برای کسب مجوز دسترسی (ارتقاء سطح دسترسی)
      void this.auditService.logAdmin({
        adminUserId: req.user?.adminUserId ?? null,
        action: 'admin_auth.permission_denied',
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
        source: context.getClass().name,
        success: false,
        newValue: { required, has: permissions },
      });
      throw new ForbiddenException('شما دسترسی لازم برای این عملیات را ندارید');
    }
    return true;
  }
}
