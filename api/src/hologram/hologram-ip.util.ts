// api/src/hologram/hologram-ip.util.ts
//
// استخراج IP واقعی کلاینت پشت پراکسی/CDN (بند ۵.۲). این پروژه فرض می‌کند سرویس
// همیشه پشت یک reverse proxy/CDN شناخته‌شده (مثلاً Cloudflare یا Nginx) قرار
// دارد که هدرهای ورودی کلاینت را strip/بازنویسی می‌کند؛ بدون چنین لایه‌ای این
// هدرها به‌راحتی قابل جعل هستند. ترتیب اولویت:
//   ۱) CF-Connecting-IP (Cloudflare — قابل‌اعتمادترین حالت چون در edge ست می‌شود)
//   ۲) اولین مقدار در X-Forwarded-For (نزدیک‌ترین به کلاینت اصلی در زنجیره پراکسی)
//   ۳) req.ip (وقتی trust proxy در main.ts فعال است، Express خودش از X-Forwarded-For می‌خواند)
import { Request } from 'express';

export function extractClientIp(req: Request): string {
  const cfConnectingIp = req.headers['cf-connecting-ip'];
  if (typeof cfConnectingIp === 'string' && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedValue = Array.isArray(forwardedFor)
    ? forwardedFor[0]
    : forwardedFor;
  if (forwardedValue) {
    const first = forwardedValue.split(',')[0]?.trim();
    if (first) return first;
  }

  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
