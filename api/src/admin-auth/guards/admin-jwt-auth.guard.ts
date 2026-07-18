// api/src/admin-auth/guards/admin-jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_ADMIN_PUBLIC_KEY } from '../decorators/admin-public.decorator';
import { ADMIN_JWT_STRATEGY_NAME } from '../strategies/admin-jwt.strategy';

@Injectable()
export class AdminJwtAuthGuard extends AuthGuard(ADMIN_JWT_STRATEGY_NAME) {
  constructor(private reflector: Reflector) {
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
}
