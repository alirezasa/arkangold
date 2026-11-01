// app/lib/cookie-names.ts
//
// FMT_CFG_EXT.4.1 — نام کوکی‌های نشست در production با پیشوند __Host- : مرورگر چنین کوکی‌ای را فقط
// با Secure، مسیر «/» و بدون Domain می‌پذیرد، پس نه از زیردامنه‌ی دیگر قابل تنظیم/بازنویسی است و نه
// روی HTTP فرستاده می‌شود. در توسعه‌ی محلی (http://localhost) پیشوند ممکن نیست و نام ساده استفاده می‌شود.
// کوکی‌ها همه HttpOnly و SameSite=Strict هستند و فقط با Set-Cookie سمت سرور تنظیم می‌شوند.
const secure = process.env.NODE_ENV === "production";
const prefix = secure ? "__Host-" : "";

export const ACCESS_COOKIE = `${prefix}accessToken`;
export const REFRESH_COOKIE = `${prefix}refreshToken`;
/** نام‌های پیش از پیشوند — فقط برای پاک کردن کوکی‌های قدیمی */
export const LEGACY_SESSION_COOKIES = secure ? ["accessToken", "refreshToken"] : [];
