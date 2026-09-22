// api/src/common/audit/audit.service.ts
// سرویس متمرکز رویدادنگاری امنیتی — پاسخ‌گوی الزام FAU_GEN_EXT.1.1
// هر رویداد باید حداقل پاسخ‌گوی این سؤالات باشد: چه زمانی، کجا (source)،
// چه کسی (actor/ip/userAgent)، چه چیزی (action + old/newValue).
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface AdminAuditEvent {
  /** null یعنی هنوز هویت ادمین معتبر شناخته نشده (مثلاً تلاش ناموفق ورود) */
  adminUserId?: string | null;
  /** برای رویدادهایی که adminUserId ندارند (مثلاً نام کاربری واردشده در تلاش ناموفق) */
  actorLabel?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  /** نام مؤلفه/سرویس تولیدکننده رویداد؛ پاسخ به «کجا» */
  source: string;
  success?: boolean;
}

export interface UserAuditEvent {
  userId?: string | null;
  adminId?: string | null;
  actorLabel?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  source: string;
  success?: boolean;
}

function toJson(value: unknown) {
  if (value === undefined || value === null) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** ثبت رویداد امنیتی برای اقدامات پنل ادمین (admin_audit_logs) */
  async logAdmin(event: AdminAuditEvent): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminUserId: event.adminUserId ?? undefined,
          actorLabel: event.actorLabel ?? undefined,
          action: event.action,
          entityType: event.entityType ?? event.action.split('.')[0],
          entityId: event.entityId ?? undefined,
          oldValue: toJson(event.oldValue),
          newValue: toJson(event.newValue),
          ip: event.ip ?? undefined,
          userAgent: event.userAgent ?? undefined,
          source: event.source,
          success: event.success ?? true,
        },
      });
    } catch (err) {
      // ثبت رویداد هرگز نباید عملیات اصلی را fail کند
      this.logger.warn(`ثبت رویداد امنیتی ادمین ناموفق بود: ${(err as Error).message}`);
    }
  }

  /** ثبت رویداد امنیتی برای اقدامات کاربران عادی (audit_logs) */
  async logUser(event: UserAuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: event.userId ?? undefined,
          adminId: event.adminId ?? undefined,
          actorLabel: event.actorLabel ?? undefined,
          action: event.action,
          entityType: event.entityType ?? event.action.split('.')[0],
          entityId: event.entityId ?? undefined,
          oldValue: toJson(event.oldValue),
          newValue: toJson(event.newValue),
          ip: event.ip ?? undefined,
          userAgent: event.userAgent ?? undefined,
          source: event.source,
          success: event.success ?? true,
        },
      });
    } catch (err) {
      this.logger.warn(`ثبت رویداد امنیتی کاربر ناموفق بود: ${(err as Error).message}`);
    }
  }
}
