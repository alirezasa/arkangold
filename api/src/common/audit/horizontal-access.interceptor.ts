// api/src/common/audit/horizontal-access.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from './audit.service';
import {
  OWNED_RESOURCE_KEY,
  OwnedResourceOptions,
} from './owned-resource.decorator';

interface RequestUser {
  userId?: string;
  phone?: string;
}

type FindUniqueDelegate = {
  findUnique(args: {
    where: { id: string };
    select: Record<string, unknown>;
  }): Promise<Record<string, unknown> | null>;
};

/** 'cart.userId' ← { cart: { select: { userId: true } } } */
function buildSelect(path: string): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  return rest.length === 0
    ? { [head]: true }
    : { [head]: { select: buildSelect(rest.join('.')) } };
}

function readPath(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (cur, key) =>
        cur && typeof cur === 'object'
          ? (cur as Record<string, unknown>)[key]
          : undefined,
      obj,
    );
}

@Injectable()
export class HorizontalAccessInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<OwnedResourceOptions | undefined>(
      OWNED_RESOURCE_KEY,
      context.getHandler(),
    );
    if (!options) return next.handle();

    return next.handle().pipe(
      catchError((err) => {
        if (err instanceof NotFoundException || err instanceof ForbiddenException) {
          void this.detect(context, options);
        }
        return throwError(() => err);
      }),
    );
  }

  private async detect(
    context: ExecutionContext,
    options: OwnedResourceOptions,
  ): Promise<void> {
    const req = context.switchToHttp().getRequest();
    const user: RequestUser | undefined = req.user;
    const resourceId: string | undefined = req.params?.[options.param ?? 'id'];
    const actor = user?.[options.actorKey ?? 'userId'];
    if (!resourceId || !actor || !user?.userId) return;

    let row: Record<string, unknown> | null;
    try {
      const delegate = (this.prisma as unknown as Record<string, FindUniqueDelegate>)[options.model];
      row = await delegate.findUnique({
        where: { id: resourceId },
        select: buildSelect(options.ownerPath),
      });
    } catch {
      // شناسه‌ی نامعتبر (مثلاً UUID بدفرم) — منبعی وجود ندارد
      return;
    }
    if (!row) return;

    const owner = readPath(row, options.ownerPath);
    if (owner === null || owner === undefined || owner === actor) return;

    await this.auditService.logUser({
      userId: user.userId,
      action: 'security.horizontal_access_attempt',
      entityType: options.model,
      entityId: resourceId,
      ip: req.ip,
      userAgent: req.headers?.['user-agent'],
      source: context.getClass().name,
      success: false,
      newValue: { method: req.method, route: req.route?.path },
    });
  }
}
