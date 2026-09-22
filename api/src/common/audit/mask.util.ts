// api/src/common/audit/mask.util.ts
// جلوگیری از افشای داده‌ی حساس در رویدادنگاری امنیتی (FAU_GEN_EXT.1.1)

/** شماره موبایل را برای ثبت در لاگ می‌پوشاند، مثلاً 0912***4567 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.trim();
  if (digits.length <= 6) return '***';
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

/** نام کاربری ادمین را برای ثبت در لاگ می‌پوشاند، مثلاً ad***in */
export function maskUsername(username: string | null | undefined): string | null {
  if (!username) return null;
  if (username.length <= 3) return `${username[0]}***`;
  return `${username.slice(0, 2)}***${username.slice(-1)}`;
}
