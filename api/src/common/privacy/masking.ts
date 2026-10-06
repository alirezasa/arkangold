// api/src/common/privacy/masking.ts
//
// FDP_ACC_EXT.1.5 — داده‌های حساس هویتی در پاسخ‌ها به‌صورت پیش‌فرض پوشانده می‌شوند؛ نمایش
// کامل فقط با درخواست صریح («نمایش») از endpoint جداگانه و با ثبت رویداد ممیزی انجام می‌شود.

/** ۰۰۱۲۳۴۵۶۷۸ → ۰۰۱****۶۷۸ */
export function maskNationalCode(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  if (code.length < 7) return '*'.repeat(code.length);
  return `${code.slice(0, 3)}${'*'.repeat(code.length - 6)}${code.slice(-3)}`;
}
