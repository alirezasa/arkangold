// admin/lib/cookie-names.ts
//
// FMT_CFG_EXT.4.1 — نام کوکی‌های نشست در production با پیشوند __Host- : مرورگر چنین کوکی‌ای را فقط
// با Secure، مسیر «/» و بدون Domain می‌پذیرد، پس نه از زیردامنه‌ی دیگر قابل تنظیم/بازنویسی است و نه
// روی HTTP فرستاده می‌شود. در توسعه‌ی محلی (http://localhost) پیشوند ممکن نیست و نام ساده استفاده می‌شود.
const secure = process.env.NODE_ENV === "production";
const prefix = secure ? "__Host-" : "";

export const ADMIN_ACCESS_COOKIE = `${prefix}adminAccessToken`;
export const ADMIN_REFRESH_COOKIE = `${prefix}adminRefreshToken`;
/** نام‌های پیش از پیشوند — فقط برای پاک کردن کوکی‌های قدیمی */
export const LEGACY_ADMIN_COOKIES = secure ? ["adminAccessToken", "adminRefreshToken"] : [];
