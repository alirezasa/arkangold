// api/src/common/audit/hash-chain.util.ts
// ابزار زنجیره‌ی hash برای تضمین یکپارچگی رویدادهای امنیتی (FAU_STG_EXT.1.2).
// هر رکورد شامل hash خودش + hash رکورد قبلی است؛ تغییر یا حذف یک رکورد قدیمی
// زنجیره‌ی بعد از آن را نامعتبر می‌کند و قابل‌کشف است.
import * as crypto from 'crypto';

export const GENESIS_HASH = '0'.repeat(64);

export function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * سریالایز قطعی (deterministic) به‌صورت بازگشتی — کلیدها در تمام سطوح تودرتو
 * مرتب می‌شوند. لازم است چون PostgreSQL jsonb ترتیب اصلی کلیدهای شیء JS را
 * هنگام ذخیره/بازخوانی حفظ نمی‌کند؛ بدون این کار، hash محاسبه‌شده در زمان
 * verifyChain با رکورد سالم هم به‌اشتباه ناهمخوان تشخیص داده می‌شد.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalize(item)).join(',') + ']';
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`);
  return '{' + entries.join(',') + '}';
}
