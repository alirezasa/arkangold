import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuditService } from '../../common/audit/audit.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
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
        info?.name === 'TokenExpiredError' ? 'auth.session_expired' : 'auth.invalid_token';
      void this.auditService.logUser({
        userId: null,
        action,
        ip: req.ip,
        userAgent: req.headers?.['user-agent'],
        source: 'JwtAuthGuard',
        success: false,
      });
    }
    return super.handleRequest(err, user, info, context) as TUser;
  }
}
