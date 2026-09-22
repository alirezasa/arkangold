// api/src/common/audit/audit.service.ts
// سرویس متمرکز رویدادنگاری امنیتی — پاسخ‌گوی الزامات:
// FAU_GEN_EXT.1.1 (فراداده‌ی ضروری: چه‌زمانی/کجا/چه‌کسی/چه‌چیزی)
// FAU_GEN_EXT.1.2 (مهر زمانی UTC صریح — createdAt به‌صورت timestamptz)
// FAU_GEN_EXT.1.4 (پوشاندن داده‌های حساس پیش از ثبت — از طریق redact())
// FAU_STG_EXT.1.2 (یکپارچگی رویدادها — زنجیره‌ی hash)
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { redact } from './redact.util';
import { sha256Hex, canonicalize, GENESIS_HASH } from './hash-chain.util';

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

export interface ChainVerificationResult {
  valid: boolean;
  checked: number;
  brokenAtId?: string;
}

type TxClient = Prisma.TransactionClient;
type ChainId = 'admin' | 'user';

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  try {
    return redact(value) as Prisma.InputJsonValue;
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
    const fields = {
      adminUserId: event.adminUserId ?? null,
      actorLabel: event.actorLabel ?? null,
      action: event.action,
      entityType: event.entityType ?? event.action.split('.')[0],
      entityId: event.entityId ?? null,
      oldValue: toJson(event.oldValue),
      newValue: toJson(event.newValue),
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      source: event.source,
      success: event.success ?? true,
      createdAt: new Date(),
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const prevHash = await this.lockChain(tx, 'admin');
        const hash = sha256Hex(
          prevHash + '|' + canonicalize({ ...fields, prevHash }),
        );
        await tx.adminAuditLog.create({ data: { ...fields, prevHash, hash } });
        await this.advanceChain(tx, 'admin', hash);
      });
    } catch (err) {
      // ثبت رویداد هرگز نباید عملیات اصلی را fail کند
      this.logger.warn(`ثبت رویداد امنیتی ادمین ناموفق بود: ${(err as Error).message}`);
    }
  }

  /** ثبت رویداد امنیتی برای اقدامات کاربران عادی (audit_logs) */
  async logUser(event: UserAuditEvent): Promise<void> {
    const fields = {
      userId: event.userId ?? null,
      adminId: event.adminId ?? null,
      actorLabel: event.actorLabel ?? null,
      action: event.action,
      entityType: event.entityType ?? event.action.split('.')[0],
      entityId: event.entityId ?? null,
      oldValue: toJson(event.oldValue),
      newValue: toJson(event.newValue),
      ip: event.ip ?? null,
      userAgent: event.userAgent ?? null,
      source: event.source,
      success: event.success ?? true,
      createdAt: new Date(),
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const prevHash = await this.lockChain(tx, 'user');
        const hash = sha256Hex(
          prevHash + '|' + canonicalize({ ...fields, prevHash }),
        );
        await tx.auditLog.create({ data: { ...fields, prevHash, hash } });
        await this.advanceChain(tx, 'user', hash);
      });
    } catch (err) {
      this.logger.warn(`ثبت رویداد امنیتی کاربر ناموفق بود: ${(err as Error).message}`);
    }
  }

  /** قفل کردن ردیف وضعیت زنجیره برای جلوگیری از race بین نوشتن‌های همزمان، و برگرداندن آخرین hash */
  private async lockChain(tx: TxClient, chainId: ChainId): Promise<string> {
    const rows = await tx.$queryRaw<{ last_hash: string }[]>`
      SELECT last_hash FROM audit_chain_state WHERE id = ${chainId} FOR UPDATE
    `;
    return rows[0]?.last_hash ?? GENESIS_HASH;
  }

  private async advanceChain(tx: TxClient, chainId: ChainId, hash: string): Promise<void> {
    await tx.auditChainState.upsert({
      where: { id: chainId },
      update: { lastHash: hash },
      create: { id: chainId, lastHash: hash },
    });
  }

  /** بازبینی کامل زنجیره برای تشخیص دستکاری/حذف رکوردها — برای استفاده‌ی ادمین از طریق endpoint بازرسی */
  async verifyChain(chainId: ChainId): Promise<ChainVerificationResult> {
    const rows =
      chainId === 'admin'
        ? await this.prisma.adminAuditLog.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              prevHash: true,
              hash: true,
              adminUserId: true,
              actorLabel: true,
              action: true,
              entityType: true,
              entityId: true,
              oldValue: true,
              newValue: true,
              ip: true,
              userAgent: true,
              source: true,
              success: true,
              createdAt: true,
            },
          })
        : await this.prisma.auditLog.findMany({
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              prevHash: true,
              hash: true,
              userId: true,
              adminId: true,
              actorLabel: true,
              action: true,
              entityType: true,
              entityId: true,
              oldValue: true,
              newValue: true,
              ip: true,
              userAgent: true,
              source: true,
              success: true,
              createdAt: true,
            },
          });

    let expectedPrevHash = GENESIS_HASH;
    let checked = 0;
    for (const row of rows) {
      const { id, prevHash, hash, ...rest } = row;
      // رکوردهای قدیمی‌تر از افزودن این قابلیت ممکن است hash نداشته باشند — نادیده گرفته می‌شوند
      if (prevHash === null || hash === null) continue;
      if (prevHash !== expectedPrevHash) {
        return { valid: false, checked, brokenAtId: id };
      }
      const recomputed = sha256Hex(
        prevHash + '|' + canonicalize({ ...rest, prevHash }),
      );
      if (recomputed !== hash) {
        return { valid: false, checked, brokenAtId: id };
      }
      expectedPrevHash = hash;
      checked += 1;
    }

    return { valid: true, checked };
  }
}
