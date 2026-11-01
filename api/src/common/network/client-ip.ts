// api/src/common/network/client-ip.ts
//
// تعیین IP واقعی کلاینت برای rate limit، مسدودسازی هولوگرام، لیست IP مجاز شرکا و لاگ ممیزی.
//
// دو مسیر درخواست به API می‌رسد:
//   ۱) مستقیم از مرورگر/شریک از طریق reverse proxy پلتفرم (لیارا): Express با تنظیم
//      `trust proxy` زنجیره‌ی X-Forwarded-For را از راست پیمایش می‌کند و فقط از روی پراکسی‌های
//      مورد اعتماد (پیش‌فرض: آدرس‌های شبکه‌ی داخلی) عبور می‌کند؛ مقادیری که خود کلاینت در
//      ابتدای هدر جعل کرده باشد هرگز انتخاب نمی‌شوند.
//   ۲) از سرور Next.js (BFF در app/admin): همه‌ی این درخواست‌ها از IP سرور Next می‌آیند. BFF، IP و
//      User-Agent کاربر اصلی را در هدرهای x-arkan-client-* می‌فرستد.
//
// FMT_CFG_EXT.1.1 / FTP_DIT_EXT.3.5 — احراز هویت سرویس‌به‌سرویس BFF → API: خود راز مشترک
// (INTERNAL_PROXY_SECRET) هرگز روی شبکه فرستاده نمی‌شود؛ هر درخواست یک «توکن» کوتاه‌عمر و یک‌بارمصرف
// دارد: امضای HMAC-SHA256 روی زمان صدور، nonce تصادفی، IP و User-Agent کاربر. API فقط امضای معتبر،
// تازه (حداکثر ۶۰ ثانیه اختلاف) و nonce تکرارنشده را می‌پذیرد؛ دست‌کاری هر مقدار امضا را باطل می‌کند
// و توکن رهگیری‌شده قابل استفاده‌ی مجدد نیست.
import { createHmac, timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import type { NextFunction, Request, Response } from 'express';

export const CLIENT_IP_HEADER = 'x-arkan-client-ip';
export const CLIENT_UA_HEADER = 'x-arkan-client-ua';
/** هدر قدیمی (ارسال خود راز) — دیگر پذیرفته نمی‌شود و فقط حذف می‌شود */
export const PROXY_SECRET_HEADER = 'x-arkan-proxy-secret';
export const PROXY_TS_HEADER = 'x-arkan-ts';
export const PROXY_NONCE_HEADER = 'x-arkan-nonce';
export const PROXY_SIG_HEADER = 'x-arkan-sig';
const INTERNAL_HEADERS = [
  CLIENT_IP_HEADER,
  CLIENT_UA_HEADER,
  PROXY_SECRET_HEADER,
  PROXY_TS_HEADER,
  PROXY_NONCE_HEADER,
  PROXY_SIG_HEADER,
];
/** حداکثر اختلاف زمان امضا با ساعت API */
export const PROXY_MAX_SKEW_MS = 60_000;

/** امضای BFF؛ همین تابع (با همین ترتیب) در app/lib و admin/lib پیاده شده است */
export function signBffRequest(
  secret: string,
  ts: string,
  nonce: string,
  ip: string,
  ua: string,
): string {
  return createHmac('sha256', secret)
    .update(`arkan-bff-v1|${ts}|${nonce}|${ip}|${ua}`, 'utf8')
    .digest('base64url');
}

/** ثبت nonce؛ true یعنی بار اول است (برای جلوگیری از بازپخش) */
export type NonceRegistry = (
  nonce: string,
  ttlSeconds: number,
) => Promise<boolean>;

/** پراکسی‌های مورد اعتماد پیش‌فرض: loopback، link-local، شبکه‌های خصوصی و CGNAT داخل کلاستر پلتفرم */
export const DEFAULT_TRUST_PROXY =
  'loopback, linklocal, uniquelocal, 100.64.0.0/10';

/**
 * رنج‌های IP یک CDN (مثلاً آروان‌کلاد) از متغیر CDN_PROXY_RANGES: فهرست IP یا CIDR جداشده با کاما،
 * فاصله یا خط جدید. مقادیر نامعتبر کنار گذاشته و جداگانه برگردانده می‌شوند تا در راه‌اندازی هشدار داده شود.
 */
export function parseProxyRanges(raw = process.env.CDN_PROXY_RANGES): {
  valid: string[];
  invalid: string[];
} {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const entry of (raw ?? '').split(/[\s,]+/).filter(Boolean)) {
    const [addr, prefix, ...rest] = entry.split('/');
    const family = isIP(addr);
    const maxPrefix = family === 6 ? 128 : 32;
    const prefixOk =
      prefix === undefined ||
      (/^\d+$/.test(prefix) && Number(prefix) <= maxPrefix);
    if (family && prefixOk && rest.length === 0) valid.push(entry);
    else invalid.push(entry);
  }
  return { valid, invalid };
}

/**
 * مقدار `trust proxy` در Express از متغیر TRUST_PROXY:
 * عدد = تعداد hop، true/false، یا فهرست آدرس/زیرشبکه.
 * رنج‌های CDN_PROXY_RANGES (مثلاً IPهای آروان) به فهرست پیش‌فرض یا فهرست TRUST_PROXY اضافه می‌شوند؛
 * بدون آن‌ها پشت CDN، IP سرور لبه‌ی CDN به‌جای IP کاربر شمرده می‌شود و همه‌ی کاربرانی که از یک
 * سرور لبه می‌آیند rate limit و مسدودسازی مشترک پیدا می‌کنند.
 */
export function resolveTrustProxy(
  raw = process.env.TRUST_PROXY,
  cdnRaw = process.env.CDN_PROXY_RANGES,
): boolean | number | string {
  const value = raw?.trim();
  if (value && /^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  const cdn = parseProxyRanges(cdnRaw).valid;
  return [value || DEFAULT_TRUST_PROXY, ...cdn].join(', ');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/**
 * middleware سراسری: اگر درخواست از BFF مورد اعتماد آمده باشد، req.ip و user-agent را با مقادیر
 * کاربر اصلی جایگزین می‌کند؛ در هر حال هدرهای داخلی را حذف می‌کند تا به لایه‌های بعدی نرسند.
 */
export function clientIpMiddleware(
  secret = process.env.INTERNAL_PROXY_SECRET,
  registerNonce?: NonceRegistry,
  now: () => number = Date.now,
) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const forwardedIp = headerValue(req, CLIENT_IP_HEADER) ?? '';
    const forwardedUa = headerValue(req, CLIENT_UA_HEADER) ?? '';
    const ts = headerValue(req, PROXY_TS_HEADER) ?? '';
    const nonce = headerValue(req, PROXY_NONCE_HEADER) ?? '';
    const sig = headerValue(req, PROXY_SIG_HEADER) ?? '';
    for (const h of INTERNAL_HEADERS) delete req.headers[h];

    const apply = () => {
      if (forwardedIp && isIP(forwardedIp)) {
        // req.ip در Express یک getter روی prototype است؛ property خود شیء آن را برای همین درخواست پوشش می‌دهد
        Object.defineProperty(req, 'ip', {
          value: forwardedIp,
          configurable: true,
          enumerable: true,
        });
      }
      if (forwardedUa) req.headers['user-agent'] = forwardedUa;
    };

    const fresh =
      /^\d{13}$/.test(ts) && Math.abs(now() - Number(ts)) <= PROXY_MAX_SKEW_MS;
    const valid =
      !!secret &&
      fresh &&
      /^[A-Za-z0-9_-]{16,64}$/.test(nonce) &&
      !!sig &&
      safeEqual(
        sig,
        signBffRequest(secret, ts, nonce, forwardedIp, forwardedUa),
      );
    if (!valid) return next();
    if (!registerNonce) {
      apply();
      return next();
    }
    registerNonce(nonce, Math.ceil((PROXY_MAX_SKEW_MS * 2) / 1000))
      .then((first) => {
        if (first) apply();
        next();
      })
      .catch(() => next()); // در خطای Redis هویت ارسالی پذیرفته نمی‌شود (fail-closed)
  };
}
