// api/src/admin-auth/interceptors/audit-log.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { AuditService } from '../../common/audit/audit.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit-log.decorator';
import { AdminAuthenticatedUser } from '../interfaces/admin-jwt-payload.interface';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const action = this.reflector.getAllAndOverride<string>(AUDIT_ACTION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!action) return next.handle();

    const req = context.switchToHttp().getRequest();
    const admin: AdminAuthenticatedUser | undefined = req.user;
    // شناسه‌ی موجودیت هدف؛ کنترلرهای مختلف نام‌های متفاوتی برای پارامتر مسیر استفاده می‌کنند (id, userId, ...)
    const entityId: string | undefined =
      req.params?.id ?? Object.values(req.params ?? {})[0];
    // پاسخ به «کجا»: نام کنترلر/مؤلفه‌ای که رویداد را تولید کرده
    const source = context.getClass().name;

    if (!admin) return next.handle();

    return next.handle().pipe(
      tap((result) => {
        void this.auditService.logAdmin({
          adminUserId: admin.adminUserId,
          action,
          entityId: entityId ?? null,
          newValue: result,
          ip: req.ip,
          userAgent: req.headers?.['user-agent'],
          source,
          success: true,
        });
      }),
      catchError((err) => {
        void this.auditService.logAdmin({
          adminUserId: admin.adminUserId,
          action,
          entityId: entityId ?? null,
          newValue: { error: err instanceof Error ? err.message : String(err) },
          ip: req.ip,
          userAgent: req.headers?.['user-agent'],
          source,
          success: false,
        });
        return throwError(() => err);
      }),
    );
  }
}
