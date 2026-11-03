// api/src/common/utils/tehran-time.ts
//
// تاریخ شمسی «به وقت تهران» — سرور با TZ=UTC اجرا می‌شود، پس هر تبدیل تاریخ رسمی
// (دفاتر قانونی، سال مالی، دفاتر تجاری الکترونیکی) باید صریحاً با منطقه‌ی Asia/Tehran انجام شود؛
// وگرنه سندی که ساعت ۰۰:۰۰ تا ۰۳:۳۰ بامداد تهران ثبت شده تاریخ روز قبل می‌گیرد.
//
// قرارداد تاریخ‌های «فقط روز» در سیستم: ورودی YYYY-MM-DD به‌صورت نیمه‌شب UTC همان روز ذخیره
// می‌شود (۰۳:۳۰ بامداد تهران همان روز)؛ پس روز تقویمی آن‌ها همان مؤلفه‌های UTC است.

import * as jalaali from 'jalaali-js';

export const TEHRAN_TZ = 'Asia/Tehran';

export interface YMD {
  y: number;
  m: number;
  d: number;
}

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TEHRAN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function tehranWall(date: Date) {
  const p: Record<string, number> = {};
  for (const part of partsFmt.formatToParts(date)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return p as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** روز میلادی یک لحظه به وقت تهران */
export function tehranGregorian(date: Date): YMD {
  const p = tehranWall(date);
  return { y: p.year, m: p.month, d: p.day };
}

/** اختلاف ساعت تهران با UTC در یک لحظه (دقیقه) */
function tehranOffsetMinutes(date: Date): number {
  const p = tehranWall(date);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** لحظه‌ی شروع (۰۰:۰۰ تهران) یک روز میلادی */
export function tehranDayStart(g: YMD): Date {
  const base = Date.UTC(g.y, g.m - 1, g.d);
  let t = base - 210 * 60000; // حدس اولیه: +۰۳:۳۰
  for (let i = 0; i < 2; i++) {
    t = base - tehranOffsetMinutes(new Date(t)) * 60000;
  }
  return new Date(t);
}

/** روز تقویمی یک تاریخِ «فقط روز» ذخیره‌شده (نیمه‌شب UTC یا پایان روز UTC) */
export function storedDay(date: Date): YMD {
  return {
    y: date.getUTCFullYear(),
    m: date.getUTCMonth() + 1,
    d: date.getUTCDate(),
  };
}

export function addDays(g: YMD, days: number): YMD {
  const t = new Date(Date.UTC(g.y, g.m - 1, g.d + days));
  return storedDay(t);
}

export function gregorianToJalali(g: YMD): YMD {
  const j = jalaali.toJalaali(g.y, g.m, g.d);
  return { y: j.jy, m: j.jm, d: j.jd };
}

export function jalaliToGregorian(j: YMD): YMD {
  const g = jalaali.toGregorian(j.y, j.m, j.d);
  return { y: g.gy, m: g.gm, d: g.gd };
}

export function jalaliMonthLength(y: number, m: number): number {
  return jalaali.jalaaliMonthLength(y, m);
}

/** تاریخ شمسی یک لحظه به وقت تهران */
export function tehranJalali(date: Date): YMD {
  return gregorianToJalali(tehranGregorian(date));
}

const pad = (v: number) => String(v).padStart(2, '0');

/** «1404/01/31» با ارقام لاتین (قالب سامانه‌ی دفاتر تجاری) */
export function formatJalaliKey(j: YMD): string {
  return `${j.y}/${pad(j.m)}/${pad(j.d)}`;
}

/** «2025-04-20» */
export function formatIsoDay(g: YMD): string {
  return `${g.y}-${pad(g.m)}-${pad(g.d)}`;
}

export function parseIsoDay(v: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const g = { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const back = storedDay(new Date(Date.UTC(g.y, g.m - 1, g.d)));
  return back.y === g.y && back.m === g.m && back.d === g.d ? g : null;
}

/** مقایسه‌ی دو روز: منفی / صفر / مثبت */
export function compareDay(a: YMD, b: YMD): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

/**
 * بازه‌ی واقعی یک سال مالی به وقت تهران: از ۰۰:۰۰ روز شروع تا ۰۰:۰۰ روز بعد از پایان (انحصاری).
 * startDate/endDate سال مالی تاریخ «فقط روز» ذخیره‌شده‌اند.
 */
export function fiscalYearRange(y: { startDate: Date; endDate: Date }): {
  gte: Date;
  lt: Date;
  firstDay: YMD;
  lastDay: YMD;
} {
  // تاریخ «فقط روز» (نیمه‌شب UTC یا پایان روز UTC، مسیر عادی پنل) = کل آن روز به وقت تهران؛
  // لحظه‌ی دقیق (ورودی ISO با ساعت از API) همان لحظه
  const s = y.startDate;
  const e = y.endDate;
  const startIsDay = isUtcMidnight(s);
  const endIsDay = isUtcMidnight(e) || isUtcEndOfDay(e);
  const firstDay = startIsDay ? storedDay(s) : tehranGregorian(s);
  const lastDay = endIsDay ? storedDay(e) : tehranGregorian(e);
  return {
    gte: startIsDay ? tehranDayStart(firstDay) : s,
    lt: endIsDay
      ? tehranDayStart(addDays(lastDay, 1))
      : new Date(e.getTime() + 1),
    firstDay,
    lastDay,
  };
}

function isUtcMidnight(d: Date): boolean {
  return d.getTime() % 86_400_000 === 0;
}

function isUtcEndOfDay(d: Date): boolean {
  return (d.getTime() + 1) % 86_400_000 === 0;
}
