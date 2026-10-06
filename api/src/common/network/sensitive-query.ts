// api/src/common/network/sensitive-query.ts
//
// FDP_ACC_EXT.1.1 — داده‌های حساس (موبایل، کد ملی، عبارت جستجوی شامل این‌ها) نباید در URL
// قرار گیرند، چون URL در لاگ پراکسی/وب‌سرور، تاریخچه‌ی مرورگر و سرآیند Referer ثبت می‌شود.
// کلاینت‌های پنل این پارامترها را در سرآیند X-Arkan-Query (JSON با کدگذاری base64url) می‌فرستند
// و این میان‌افزار آن‌ها را — فقط برای کلیدهای فهرست مجاز — به req.query اضافه می‌کند تا
// کنترلرها بدون تغییر از @Query() بخوانند. همین کلیدها اگر در خود URL آمده باشند حذف می‌شوند
// تا هیچ کلاینتی نتواند داده‌ی حساس را از مسیر URL به سرویس برساند.
import type { NextFunction, Request, Response } from 'express';

export const SENSITIVE_QUERY_HEADER = 'x-arkan-query';
/** پارامترهایی که فقط از سرآیند پذیرفته می‌شوند */
export const SENSITIVE_QUERY_KEYS = [
  'search',
  'phone',
  'mobile',
  'nationalCode',
  'q',
] as const;
const MAX_HEADER_LENGTH = 4096;
const MAX_VALUE_LENGTH = 200;

export function decodeSensitiveQuery(
  raw: string | undefined,
): Record<string, string> {
  if (!raw || raw.length > MAX_HEADER_LENGTH) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: Record<string, string> = {};
  for (const key of SENSITIVE_QUERY_KEYS) {
    const v = (parsed as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.length <= MAX_VALUE_LENGTH) out[key] = v;
  }
  return out;
}

export function sensitiveQueryMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const fromHeader = decodeSensitiveQuery(
      req.header(SENSITIVE_QUERY_HEADER) ?? undefined,
    );
    const query = { ...(req.query as Record<string, unknown>) };
    let changed = false;
    for (const key of SENSITIVE_QUERY_KEYS) {
      if (key in query) {
        delete query[key];
        changed = true;
      }
    }
    if (Object.keys(fromHeader).length) {
      Object.assign(query, fromHeader);
      changed = true;
    }
    // در Express 5، req.query یک getter است؛ مقدار جدید به‌صورت property خود شیء تعریف می‌شود
    if (changed) {
      Object.defineProperty(req, 'query', {
        value: query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}
