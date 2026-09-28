// api/src/common/logging/otp-debug.ts
// FAU_GEN_EXT.1.4: کد OTP (و متن پیامک که حاوی کد است) به‌طور پیش‌فرض هرگز در لاگ ثبت نمی‌شود.
//   - توسعه‌ی محلی (NODE_ENV غیر production): فقط با OTP_DEBUG_LOG=true
//   - production: فقط وقتی هر دو OTP_DEBUG_LOG=true و OTP_DEBUG_LOG_ALLOW_PRODUCTION=true تنظیم شده باشند؛
//     برای دوره‌ی راه‌اندازی که هنوز سرویس پیامک واقعی وصل نشده. پس از اتصال پیامک باید حذف شوند.
// سطح لاگ warn است تا با LOG_LEVEL=info (پیش‌فرض) هم دیده شود.

export function isOtpDebugLogEnabled(env = process.env): boolean {
  if (env.OTP_DEBUG_LOG !== 'true') return false;
  if (env.NODE_ENV !== 'production') return true;
  return env.OTP_DEBUG_LOG_ALLOW_PRODUCTION === 'true';
}

/** برای هشدار زمان راه‌اندازی: لاگ OTP در محیط production روشن است */
export function isOtpDebugLogEnabledInProduction(env = process.env): boolean {
  return env.NODE_ENV === 'production' && isOtpDebugLogEnabled(env);
}
