// api/src/admin-auth/guards/admin-jwt-auth.guard.ts
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_ADMIN_PUBLIC_KEY } from '../decorators/admin-public.decorator';
import { ADMIN_JWT_STRATEGY_NAME } from '../strategies/admin-jwt.strategy';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class AdminJwtAuthGuard extends AuthGuard(ADMIN_JWT_STRATEGY_NAME) {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_ADMIN_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) return true;
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: { name?: string; message?: string } | undefined,
    context: ExecutionContext,
  ): TUser {
    if (err || !user) {
      // FAU_GEN_EXT.1.5 (انقضای نشست) / FAU_GEN_EXT.1.6 (تلاش با توکن نامعتبر)
      const req = context.switchToHttp().getRequest();
      const action =
        info?.name === 'TokenExpiredError'
          ? 'admin_auth.session_expired'
          : 'admin_auth.invalid_token';
      void this.auditService.logAdmin({
        adminUserId: null,
        action,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
        source: 'AdminJwtAuthGuard',
        success: false,
      });
    }
    return super.handleRequest(err, user, info, context) as TUser;
  }
}
