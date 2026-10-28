// api/src/livechat/livechat-hours.util.ts
// ساعات کاری چت به وقت تهران (مستقل از منطقه‌ی زمانی سرور)
import * as jalaali from 'jalaali-js';
import type { WorkingDay } from './livechat-settings.types';
import { toEnglishDigits } from '../common/utils/jalali.util';

export const WEEKDAY_NAMES = [
  'شنبه',
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
];

interface TehranNow {
  /** ۰ = شنبه */
  weekday: number;
  minutes: number;
  jalali: string;
}

export function tehranNow(date = new Date()): TehranNow {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const jsDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const jsDay = jsDays.indexOf(get('weekday'));
  const { jy, jm, jd } = jalaali.toJalaali(
    Number(get('year')),
    Number(get('month')),
    Number(get('day')),
  );
  const pad = (v: number) => String(v).padStart(2, '0');
  return {
    weekday: (jsDay + 1) % 7,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
    jalali: `${jy}/${pad(jm)}/${pad(jd)}`,
  };
}

export function parseHHmm(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(toEnglishDigits(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/** تعطیلی «۱۴۰۴/۱/۱» یا «1404/01/01» ← «1404/01/01» */
export function normalizeJalaliDate(v: string): string | null {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(
    toEnglishDigits(v ?? '').trim(),
  );
  if (!m) return null;
  return `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}`;
}

/** آیا این لحظه در ساعات کاری است (بازه‌ی شبانه مانند ۲۲:۰۰ تا ۰۲:۰۰ هم پشتیبانی می‌شود) */
export function isWithinWorkingHours(
  days: WorkingDay[],
  holidays: Set<string>,
  date = new Date(),
): boolean {
  const now = tehranNow(date);
  if (holidays.has(now.jalali)) return false;
  const check = (weekday: number, minute: number, spill: boolean) => {
    const d = days.find((x) => x.day === weekday);
    if (!d?.open) return false;
    const start = parseHHmm(d.start);
    const end = parseHHmm(d.end);
    if (start == null || end == null) return false;
    if (start < end) return !spill && minute >= start && minute < end;
    // بازه‌ی عبوری از نیمه‌شب
    return spill ? minute < end : minute >= start;
  };
  return (
    check(now.weekday, now.minutes, false) ||
    check((now.weekday + 6) % 7, now.minutes, true)
  );
}

/** خلاصه‌ی خوانا: «شنبه تا چهارشنبه ۰۹:۰۰ تا ۱۸:۰۰، پنجشنبه ۰۹:۰۰ تا ۱۳:۰۰» */
export function describeWorkingHours(days: WorkingDay[]): string {
  const open = [...days].filter((d) => d.open).sort((a, b) => a.day - b.day);
  if (!open.length) return 'تعطیل';
  const groups: { from: number; to: number; range: string }[] = [];
  for (const d of open) {
    const range = `${d.start} تا ${d.end}`;
    const last = groups[groups.length - 1];
    if (last && last.range === range && last.to === d.day - 1) last.to = d.day;
    else groups.push({ from: d.day, to: d.day, range });
  }
  return groups
    .map((g) =>
      g.from === g.to
        ? `${WEEKDAY_NAMES[g.from]} ${g.range}`
        : `${WEEKDAY_NAMES[g.from]} تا ${WEEKDAY_NAMES[g.to]} ${g.range}`,
    )
    .join('، ');
}
