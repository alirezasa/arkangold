// تعیین می‌کند ارسال واقعی پیامک از سامانه‌های قاصدک / sms.ir مجاز است یا نه.
//
// قاعده: ارسال واقعی فقط در محیط عملیاتی (NODE_ENV=production) انجام می‌شود، به شرط آنکه
// سامانه از پنل ادمین فعال شده باشد (فعال‌سازی Provider و لینک آن به سرویس SMS). در محیط
// توسعه/استیجینگ Adapterها هیچ درخواستی به سامانه نمی‌فرستند و فقط «ارسال آزمایشی» ثبت می‌کنند.
//   - SMS_LIVE_SEND=false  → در production هم ارسال واقعی خاموش است (کلید اضطراری)
//   - SMS_LIVE_SEND=true   → در محیط غیرعملیاتی هم ارسال واقعی انجام می‌شود (فقط برای تست کنترل‌شده)

export function isLiveSmsAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const flag = env.SMS_LIVE_SEND?.trim().toLowerCase();
  if (flag === 'false') return false;
  if (env.NODE_ENV === 'production') return true;
  return flag === 'true';
}

/** نرمال‌سازی شماره به قالب 09xxxxxxxxx (ارقام فارسی/عربی، +98، 0098، 98) */
export function normalizeIranMobile(raw: string): string | null {
  const digits = (raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '');
  let local = digits;
  if (local.startsWith('0098')) local = local.slice(4);
  else if (local.startsWith('98') && local.length === 12)
    local = local.slice(2);
  if (local.length === 10 && local.startsWith('9')) local = `0${local}`;
  return /^09\d{9}$/.test(local) ? local : null;
}
