// api/src/common/logging/otp-debug.ts
// FAU_GEN_EXT.1.4 / FMT_CFG_EXT.2.2: کد OTP (و متن پیامک که حاوی کد است) هرگز در لاگ محیط عملیاتی
// ثبت نمی‌شود. فقط در توسعه‌ی محلی (NODE_ENV غیر production) و با OTP_DEBUG_LOG=true فعال است.
// در production هیچ فلگی (از جمله OTP_DEBUG_LOG_ALLOW_PRODUCTION قدیمی) آن را روشن نمی‌کند.
// سطح لاگ warn است تا با LOG_LEVEL=info (پیش‌فرض) هم دیده شود.

export function isOtpDebugLogEnabled(env = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  return env.OTP_DEBUG_LOG === 'true';
}

/** برای هشدار زمان راه‌اندازی: فلگ اشکال‌زدایی OTP در production تنظیم شده ولی نادیده گرفته می‌شود */
export function isOtpDebugLogRequestedInProduction(env = process.env): boolean {
  return env.NODE_ENV === 'production' && env.OTP_DEBUG_LOG === 'true';
}
