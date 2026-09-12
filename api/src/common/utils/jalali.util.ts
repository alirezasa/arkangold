// api/src/common/utils/jalali.util.ts
// نکته: نصب لازم →  pnpm --filter api add jalaali-js
// تبدیل تقریبی «jYear + 621» که در پروژه بود روی اسناد رسمی قابل قبول نیست.

import * as jalaali from 'jalaali-js';

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function toEnglishDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

/** سال شمسی جاری — برای کلید شماره‌گذاری اسناد */
export function currentJalaliYear(date = new Date()): number {
  return jalaali.toJalaali(date).jy;
}

/** «۱۴۰۴/۰۶/۱۹» */
export function formatJalaliDate(date: Date): string {
  const { jy, jm, jd } = jalaali.toJalaali(date);
  const pad = (v: number) => String(v).padStart(2, '0');
  return toPersianDigits(`${jy}/${pad(jm)}/${pad(jd)}`);
}

/** «۱۴:۳۲» — با در نظر گرفتن منطقه زمانی تهران */
export function formatTime(date: Date): string {
  const s = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tehran',
  }).format(date);
  return toPersianDigits(s);
}

/** «۱۴۰۴/۰۶/۱۹ — ساعت ۱۴:۳۲» */
export function formatJalaliDateTime(date: Date): string {
  return `${formatJalaliDate(date)} — ساعت ${formatTime(date)}`;
}

/**
 * جمعه تعطیل است. تعطیلات رسمی از پارامتر holidays (آرایه «۱۴۰۴/۰۶/۱۹»)
 * که ادمین در SystemConfig کلید `calendar.holidays` نگهداری می‌کند.
 * پنجشنبه روز کاری محسوب می‌شود.
 */
export function isWorkingDay(
  date: Date,
  holidays: Set<string> = new Set(),
): boolean {
  // getDay: 0=Sunday ... 5=Friday
  if (date.getDay() === 5) return false;
  const { jy, jm, jd } = jalaali.toJalaali(date);
  const pad = (v: number) => String(v).padStart(2, '0');
  return !holidays.has(`${jy}/${pad(jm)}/${pad(jd)}`);
}

/** افزودن n روز کاری — ساعت روز مبدأ حفظ می‌شود. */
export function addWorkingDays(
  from: Date,
  days: number,
  holidays: Set<string> = new Set(),
): Date {
  const result = new Date(from.getTime());
  let added = 0;
  let guard = 0;
  while (added < days && guard < 365) {
    result.setDate(result.getDate() + 1);
    guard++;
    if (isWorkingDay(result, holidays)) added++;
  }
  return result;
}

/** رشته کانفیگ «۱۴۰۴/۰۱/۰۱,۱۴۰۴/۰۱/۰۲» → Set */
export function parseHolidays(raw?: string | null): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => toPersianDigits(toEnglishDigits(s.trim())))
      .filter(Boolean),
  );
}
