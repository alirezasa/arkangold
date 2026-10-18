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
    // رفت‌وبرگشت JSON تا مقداری که hash می‌شود دقیقاً همان باشد که در jsonb ذخیره و بازخوانی
    // می‌شود؛ مثلاً کلید با مقدار undefined در ذخیره حذف می‌شود ولی canonicalize آن را null
    // می‌نوشت و رکورد سالم در verifyChain «دستکاری‌شده» تشخیص داده می‌شد
    const json = JSON.stringify(redact(value));
    return json === undefined
      ? undefined
      : (JSON.parse(json) as Prisma.InputJsonValue);
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
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const prevHash = await this.lockChain(tx, 'admin');
        // createdAt پس از گرفتن قفل تا ترتیب زمانی رکوردها با ترتیب زنجیره یکی باشد
        const record = { ...fields, createdAt: new Date(), prevHash };
        const hash = sha256Hex(prevHash + '|' + canonicalize(record));
        await tx.adminAuditLog.create({ data: { ...record, hash } });
        await this.advanceChain(tx, 'admin', hash);
      });
    } catch (err) {
      // ثبت رویداد هرگز نباید عملیات اصلی را fail کند
      this.logger.warn(
        `ثبت رویداد امنیتی ادمین ناموفق بود: ${(err as Error).message}`,
      );
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
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        const prevHash = await this.lockChain(tx, 'user');
        // createdAt پس از گرفتن قفل تا ترتیب زمانی رکوردها با ترتیب زنجیره یکی باشد
        const record = { ...fields, createdAt: new Date(), prevHash };
        const hash = sha256Hex(prevHash + '|' + canonicalize(record));
        await tx.auditLog.create({ data: { ...record, hash } });
        await this.advanceChain(tx, 'user', hash);
      });
    } catch (err) {
      this.logger.warn(
        `ثبت رویداد امنیتی کاربر ناموفق بود: ${(err as Error).message}`,
      );
    }
  }

  /** قفل کردن ردیف وضعیت زنجیره برای جلوگیری از race بین نوشتن‌های همزمان، و برگرداندن آخرین hash */
  private async lockChain(tx: TxClient, chainId: ChainId): Promise<string> {
    const rows = await tx.$queryRaw<{ last_hash: string }[]>`
      SELECT last_hash FROM audit_chain_state WHERE id = ${chainId} FOR UPDATE
    `;
    return rows[0]?.last_hash ?? GENESIS_HASH;
  }

  private async advanceChain(
    tx: TxClient,
    chainId: ChainId,
    hash: string,
  ): Promise<void> {
    await tx.auditChainState.upsert({
      where: { id: chainId },
      update: { lastHash: hash },
      create: { id: chainId, lastHash: hash },
    });
  }

  /** بازبینی کامل زنجیره برای تشخیص دستکاری/حذف رکوردها — برای استفاده‌ی ادمین از طریق endpoint بازرسی */
  async verifyChain(chainId: ChainId): Promise<ChainVerificationResult> {
    // آخرین hash پیش از خواندن رکوردها خوانده می‌شود؛ رکوردی که همزمان اضافه شود فقط بعد از آن می‌آید
    const head = await this.prisma.auditChainState.findUnique({
      where: { id: chainId },
    });
    const rows =
      chainId === 'admin'
        ? await this.prisma.adminAuditLog.findMany({
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

    // رکوردهای قدیمی‌تر از افزودن این قابلیت hash ندارند — نادیده گرفته می‌شوند
    const chained = rows.filter(
      (row) => row.prevHash !== null && row.hash !== null,
    );

    // پیمایش زنجیره از genesis از طریق پیوند prevHash → hash، نه ترتیب createdAt: نوشتن‌های
    // همزمان (یا رکوردهای قدیمی که createdAt پیش از گرفتن قفل داشتند) ممکن است ترتیب زمانی‌شان
    // با ترتیب زنجیره فرق کند یا در یک میلی‌ثانیه ثبت شده باشند
    const byPrevHash = new Map<string, typeof chained>();
    for (const row of chained) {
      const list = byPrevHash.get(row.prevHash) ?? [];
      list.push(row);
      byPrevHash.set(row.prevHash, list);
    }

    const visited = new Set<string>();
    const headHash = head?.lastHash ?? GENESIS_HASH;
    let reachedHead = headHash === GENESIS_HASH;
    let expectedPrevHash = GENESIS_HASH;
    let lastId: string | undefined;
    for (;;) {
      const next = byPrevHash.get(expectedPrevHash);
      if (!next) break;
      // دو رکورد با یک prevHash یعنی رکوردی جعلی به زنجیره پیوند زده شده است
      if (next.length > 1)
        return { valid: false, checked: visited.size, brokenAtId: next[1].id };
      const { id, prevHash, hash, ...rest } = next[0];
      if (visited.has(id)) break;
      const recomputed = sha256Hex(
        prevHash + '|' + canonicalize({ ...rest, prevHash }),
      );
      if (recomputed !== hash) {
        return { valid: false, checked: visited.size, brokenAtId: id };
      }
      visited.add(id);
      lastId = id;
      expectedPrevHash = hash;
      if (hash === headHash) reachedHead = true;
    }

    // رکوردی که از genesis قابل‌دسترسی نیست: رکورد پیش از آن حذف یا prevHash آن دستکاری شده است
    const orphan = chained.find((row) => !visited.has(row.id));
    if (orphan)
      return { valid: false, checked: visited.size, brokenAtId: orphan.id };
    // زنجیره به آخرین hash ثبت‌شده نرسید: رکوردهای انتهایی حذف شده‌اند
    if (!reachedHead)
      return { valid: false, checked: visited.size, brokenAtId: lastId };

    return { valid: true, checked: visited.size };
  }
}
