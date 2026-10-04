// admin/app/utils/jalali.ts
//
// تبدیل تاریخ شمسی ↔ میلادی (الگوریتم jalaali-js؛ بدون وابستگی خارجی).
// قرارداد کل پنل: مقدار ذخیره/ارسال‌شده به API همچنان ISO میلادی است
// («yyyy-mm-dd» یا «yyyy-mm-ddTHH:mm» مثل input نوع date/datetime-local)؛
// فقط نمایش و انتخاب تاریخ برای کاربر شمسی است.

export interface JDate {
  jy: number;
  jm: number;
  jd: number;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

function jalCal(jy: number) {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jm = 0;
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): JDate {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export function toJalali(gy: number, gm: number, gd: number): JDate {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd));
}

export function isLeapJalaliYear(jy: number) {
  return jalCal(jy).leap === 0;
}

export function jalaliMonthLength(jy: number, jm: number) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalaliYear(jy) ? 30 : 29;
}

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

export const JALALI_WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

const pad = (n: number) => String(n).padStart(2, "0");

/** «yyyy-mm-dd» میلادی → شمسی (null برای ورودی نامعتبر) */
export function isoToJalali(iso: string | null | undefined): JDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!m) return null;
  return toJalali(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** شمسی → «yyyy-mm-dd» میلادی */
export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

/** نمایش «۱۴۰۳/۰۵/۱۲» از «yyyy-mm-dd» میلادی */
export function formatJalali(iso: string | null | undefined, faDigits = true): string {
  const j = isoToJalali(iso);
  if (!j) return "";
  const s = `${j.jy}/${pad(j.jm)}/${pad(j.jd)}`;
  return faDigits ? toFaDigits(s) : s;
}

/** «yyyy-mm-dd» میلادی تاریخ امروز به وقت محلی مرورگر */
export function todayIsoLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** «yyyy-mm-dd» اول ماه شمسی جاری */
export function jalaliMonthStartIso(): string {
  const j = isoToJalali(todayIsoLocal())!;
  return jalaliToIso(j.jy, j.jm, 1);
}

/** «yyyy-mm-dd» اول سال شمسی جاری */
export function jalaliYearStartIso(): string {
  const j = isoToJalali(todayIsoLocal())!;
  return jalaliToIso(j.jy, 1, 1);
}

export function toFaDigits(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function toEnDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/** تجزیه‌ی ورودی تایپی «۱۴۰۳/۵/۱۲» یا «1403-05-12» به شمسی معتبر */
export function parseJalaliInput(text: string): JDate | null {
  const m = /^\s*(\d{4})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*$/.exec(toEnDigits(text));
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  const jd = Number(m[3]);
  if (jy < 1200 || jy > 1600 || jm < 1 || jm > 12 || jd < 1 || jd > jalaliMonthLength(jy, jm)) return null;
  return { jy, jm, jd };
}

/** روز هفته (۰ = شنبه) برای یک تاریخ شمسی */
export function jalaliWeekday(jy: number, jm: number, jd: number): number {
  const g = toGregorian(jy, jm, jd);
  const day = new Date(Date.UTC(g.gy, g.gm - 1, g.gd)).getUTCDay(); // 0 = یکشنبه
  return (day + 1) % 7;
}
