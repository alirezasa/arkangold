// api/src/admin-auth/interceptors/audit-log.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit-log.decorator';
import { AdminAuthenticatedUser } from '../interfaces/admin-jwt-payload.interface';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return next.handle();

    const req = context.switchToHttp().getRequest();
    const admin: AdminAuthenticatedUser | undefined = req.user;
    const entityId: string | undefined = req.params?.id;

    return next.handle().pipe(
      tap((result) => {
        if (!admin) return;
        this.prisma.adminAuditLog
          .create({
            data: {
              adminUserId: admin.adminUserId,
              action,
              entityType: action.split('.')[0],
              entityId: entityId ?? null,
              newValue: result ? JSON.parse(JSON.stringify(result)) : undefined,
              ip: req.ip,
              userAgent: req.headers?.['user-agent'],
            },
          })
          .catch(() => {
            // ثبت audit log هرگز نباید عملیات اصلی را fail کند
          });
      }),
    );
  }
}
