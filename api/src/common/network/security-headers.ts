// api/src/common/network/security-headers.ts
//
// FDP_ACC_EXT.1.4 / FDP_RIP_EXT.1.2 — هیچ پاسخ پویای API (داده‌ی شخصی، توکن، وضعیت نشست)
// نباید در حافظه‌ی نهان مرورگر، پراکسی‌های میانی یا CDN ذخیره شود: Cache-Control: no-store
// روی همه‌ی پاسخ‌ها، به‌جز فایل‌های ایستای عمومی (تصاویر محصول و بسته‌بندی) که داده‌ی کاربری
// ندارند. سرآیندهای امنیتی پایه (معادل helmet) هم روی همه‌ی پاسخ‌ها تنظیم می‌شوند.
import type { NextFunction, Request, Response } from 'express';

/** پیشوندهای ایستای عمومی که کش‌شدنشان مجاز است (بدون داده‌ی کاربر) */
export const PUBLIC_CACHEABLE_PREFIXES = [
  '/uploads/products/',
  '/uploads/packaging/',
];

const isProd = () => process.env.NODE_ENV === 'production';

export function securityHeadersMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.path || req.url;
    const cacheable = PUBLIC_CACHEABLE_PREFIXES.some((p) => path.startsWith(p));

    if (cacheable) {
      // فایل ایستا به‌صورت داده (نه سند) اجرا می‌شود: هیچ اسکریپتی در این مسیرها اجرا نمی‌شود
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self'; style-src 'none'; sandbox",
      );
    } else {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      // پاسخ‌های JSON هرگز به‌عنوان سند فعال رندر نشوند (Swagger از این قاعده مستثناست)
      if (!path.startsWith('/api/docs')) {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        );
      }
    }

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // تصاویر محصول در app.arkan.gold نمایش داده می‌شوند (هم‌سایت)، نه در سایت‌های بیگانه
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    if (isProd()) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  };
}

/** FMT_CFG_EXT.2.6 — پسوندهای مجاز برای فایل‌های ایستای عمومی (تصاویر محصول و بسته‌بندی) */
export const PUBLIC_STATIC_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

/**
 * فقط درخواست GET/HEAD برای فایل تصویری با پسوند مجاز به serve-static می‌رسد؛ هر چیز دیگری
 * (فایل پیکربندی، فایل نقطه‌دار، مسیر پوشه، پسوند ناشناخته) با 404 پاسخ داده می‌شود.
 */
export function staticImageOnlyMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    let path: string;
    try {
      path = decodeURIComponent(req.path || '');
    } catch {
      path = '';
    }
    const ok =
      (req.method === 'GET' || req.method === 'HEAD') &&
      PUBLIC_STATIC_EXTENSIONS.test(path) &&
      !path.split('/').some((seg) => seg.startsWith('.'));
    if (ok) return next();
    res.status(404).json({ statusCode: 404, message: 'یافت نشد' });
  };
}
