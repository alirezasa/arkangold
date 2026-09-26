// api/src/common/network/client-ip.ts
//
// تعیین IP واقعی کلاینت برای rate limit، مسدودسازی هولوگرام، لیست IP مجاز شرکا و لاگ ممیزی.
//
// دو مسیر درخواست به API می‌رسد:
//   ۱) مستقیم از مرورگر/شریک از طریق reverse proxy پلتفرم (لیارا/چابکان): Express با تنظیم
//      `trust proxy` زنجیره‌ی X-Forwarded-For را از راست پیمایش می‌کند و فقط از روی پراکسی‌های
//      مورد اعتماد (پیش‌فرض: آدرس‌های شبکه‌ی داخلی) عبور می‌کند؛ مقادیری که خود کلاینت در
//      ابتدای هدر جعل کرده باشد هرگز انتخاب نمی‌شوند.
//   ۲) از سرور Next.js (BFF در app/admin): همه‌ی این درخواست‌ها از IP سرور Next می‌آیند. BFF، IP و
//      User-Agent کاربر اصلی را در هدرهای x-arkan-client-* همراه با راز مشترک INTERNAL_PROXY_SECRET
//      می‌فرستد؛ فقط وقتی راز درست باشد این مقادیر پذیرفته می‌شوند.
import { timingSafeEqual } from 'crypto';
import { isIP } from 'net';
import type { NextFunction, Request, Response } from 'express';

export const CLIENT_IP_HEADER = 'x-arkan-client-ip';
export const CLIENT_UA_HEADER = 'x-arkan-client-ua';
export const PROXY_SECRET_HEADER = 'x-arkan-proxy-secret';

/** پراکسی‌های مورد اعتماد پیش‌فرض: loopback، link-local، شبکه‌های خصوصی و CGNAT داخل کلاستر پلتفرم */
export const DEFAULT_TRUST_PROXY =
  'loopback, linklocal, uniquelocal, 100.64.0.0/10';

/**
 * مقدار `trust proxy` در Express از متغیر TRUST_PROXY:
 * عدد = تعداد hop، true/false، یا فهرست آدرس/زیرشبکه (مثلاً افزودن رنج‌های Cloudflare).
 */
export function resolveTrustProxy(
  raw = process.env.TRUST_PROXY,
): boolean | number | string {
  const value = raw?.trim();
  if (!value) return DEFAULT_TRUST_PROXY;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

function secretMatches(
  provided: string | undefined,
  expected: string,
): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name];
  return (Array.isArray(value) ? value[0] : value)?.trim() || undefined;
}

/**
 * middleware سراسری: اگر درخواست از BFF مورد اعتماد آمده باشد، req.ip و user-agent را با مقادیر
 * کاربر اصلی جایگزین می‌کند؛ در هر حال هدرهای داخلی را حذف می‌کند تا به لایه‌های بعدی نرسند.
 */
export function clientIpMiddleware(secret = process.env.INTERNAL_PROXY_SECRET) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const forwardedIp = headerValue(req, CLIENT_IP_HEADER);
    const forwardedUa = headerValue(req, CLIENT_UA_HEADER);
    const trusted =
      !!secret && secretMatches(headerValue(req, PROXY_SECRET_HEADER), secret);

    delete req.headers[CLIENT_IP_HEADER];
    delete req.headers[CLIENT_UA_HEADER];
    delete req.headers[PROXY_SECRET_HEADER];

    if (trusted) {
      if (forwardedIp && isIP(forwardedIp)) {
        // req.ip در Express یک getter روی prototype است؛ property خود شیء آن را برای همین درخواست پوشش می‌دهد
        Object.defineProperty(req, 'ip', {
          value: forwardedIp,
          configurable: true,
          enumerable: true,
        });
      }
      if (forwardedUa) req.headers['user-agent'] = forwardedUa;
    }
    next();
  };
}
