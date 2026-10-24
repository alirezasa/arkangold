// api/src/zarpayesh/zarpayesh-api-log.service.ts
//
// ثبت کامل هر فراخوانی سامانه ناظر (متد، مسیر، بدنه‌ی درخواست/پاسخ، وضعیت HTTP، کد خطای مستند،
// مدت زمان و منشأ). بدنه‌ها پیش از ذخیره پاک‌سازی می‌شوند: رمز عبور و توکن‌ها حذف و کد ملی/موبایل
// (حتی رمزشده) فقط به‌صورت پوشانده ثبت می‌شوند.
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

export type ZarPayeshTrigger = 'SYSTEM' | 'ADMIN' | 'CRON';

export interface ZarPayeshLogEntry {
  method: string;
  httpMethod: string;
  path: string;
  requestBody?: unknown;
  responseBody?: unknown;
  httpStatus?: number | null;
  success: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs: number;
  srcTrackingNumber?: bigint | number | null;
  userId?: string | null;
  adminId?: string | null;
  trigger: ZarPayeshTrigger;
}

const SECRET_FIELDS = new Set([
  'password',
  'token',
  'refreshtoken',
  'authorization',
  'challenge_id',
]);
const MAX_BODY_CHARS = 20_000;
const LOG_RETENTION_DAYS = Number(
  process.env.ZARPAYESH_LOG_RETENTION_DAYS ?? 730,
);

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value;
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  if (typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SECRET_FIELDS.has(k.toLowerCase())
      ? v == null
        ? v
        : '[REDACTED]'
      : sanitize(v, depth + 1);
  }
  return out;
}

export function sanitizeForLog(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  const clean = sanitize(value);
  const text = JSON.stringify(clean ?? null);
  if (text.length > MAX_BODY_CHARS) {
    return {
      truncated: true,
      size: text.length,
      preview: text.slice(0, MAX_BODY_CHARS),
    };
  }
  return (clean ?? null) as Prisma.InputJsonValue;
}

@Injectable()
export class ZarPayeshApiLogService {
  private readonly logger = new Logger(ZarPayeshApiLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async write(entry: ZarPayeshLogEntry): Promise<void> {
    try {
      await this.prisma.zarPayeshApiLog.create({
        data: {
          method: entry.method,
          httpMethod: entry.httpMethod,
          path: entry.path,
          requestBody: sanitizeForLog(entry.requestBody),
          responseBody: sanitizeForLog(entry.responseBody),
          httpStatus: entry.httpStatus ?? null,
          success: entry.success,
          errorCode: entry.errorCode ?? null,
          errorMessage: entry.errorMessage?.slice(0, 2000) ?? null,
          durationMs: Math.round(entry.durationMs),
          srcTrackingNumber:
            entry.srcTrackingNumber != null
              ? BigInt(entry.srcTrackingNumber)
              : null,
          userId: entry.userId ?? null,
          adminId: entry.adminId ?? null,
          trigger: entry.trigger,
        },
      });
    } catch (err) {
      // ثبت لاگ هرگز نباید عملیات اصلی را مختل کند
      this.logger.error('[ZarPayesh] خطا در ثبت لاگ فراخوانی', err as Error);
    }
  }

  /** نگهداری لاگ‌ها (پیش‌فرض ۲ سال) — رکوردهای قدیمی‌تر هر شب پاک می‌شوند */
  @Cron('30 3 * * *', { timeZone: 'Asia/Tehran' })
  async purgeOld() {
    const before = new Date(Date.now() - LOG_RETENTION_DAYS * 86_400_000);
    const { count } = await this.prisma.zarPayeshApiLog.deleteMany({
      where: { createdAt: { lt: before } },
    });
    if (count) this.logger.log(`[ZarPayesh] ${count} لاگ قدیمی پاک شد`);
  }
}
