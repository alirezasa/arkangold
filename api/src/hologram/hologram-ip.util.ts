// api/src/hologram/hologram-ip.util.ts
//
// IP واقعی کلاینت (بند ۵.۲). مقدار req.ip در main.ts یک‌بار و به‌صورت امن تعیین می‌شود
// (common/network/client-ip.ts): زنجیره‌ی X-Forwarded-For فقط از روی پراکسی‌های مورد اعتماد
// پیمایش می‌شود و IP ارسالی از BFF فقط با راز مشترک INTERNAL_PROXY_SECRET پذیرفته می‌شود.
// خواندن مستقیم CF-Connecting-IP یا اولین مقدار X-Forwarded-For قابل جعل بود و حذف شد؛
// برای Cloudflare رنج‌های آن را به TRUST_PROXY اضافه کنید.
import { Request } from 'express';

export function extractClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
