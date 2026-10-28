import {
  describeWorkingHours,
  isWithinWorkingHours,
  normalizeJalaliDate,
  tehranNow,
} from './livechat-hours.util';
import { DEFAULT_LIVECHAT_SETTINGS } from './livechat-settings.types';

const days = DEFAULT_LIVECHAT_SETTINGS.workingHours.days;
// تهران UTC+3:30 (بدون ساعت تابستانی از ۱۴۰۱)
const at = (iso: string) => new Date(iso);

describe('livechat working hours', () => {
  it('روز هفته و ساعت به وقت تهران', () => {
    // ۲۰۲۶-۱۰-۲۴ شنبه است؛ ۰۶:۰۰ UTC = ۰۹:۳۰ تهران
    const now = tehranNow(at('2026-10-24T06:00:00Z'));
    expect(now.weekday).toBe(0);
    expect(now.minutes).toBe(9 * 60 + 30);
    expect(now.jalali).toBe('1405/08/02');
  });

  it('داخل و خارج ساعات کاری', () => {
    expect(
      isWithinWorkingHours(days, new Set(), at('2026-10-24T06:00:00Z')),
    ).toBe(true); // شنبه ۰۹:۳۰
    expect(
      isWithinWorkingHours(days, new Set(), at('2026-10-24T15:00:00Z')),
    ).toBe(false); // شنبه ۱۸:۳۰
    expect(
      isWithinWorkingHours(days, new Set(), at('2026-10-30T07:00:00Z')),
    ).toBe(false); // جمعه
    expect(
      isWithinWorkingHours(days, new Set(), at('2026-10-29T10:00:00Z')),
    ).toBe(false); // پنجشنبه ۱۳:۳۰
  });

  it('تعطیلی شمسی', () => {
    expect(
      isWithinWorkingHours(
        days,
        new Set(['1405/08/02']),
        at('2026-10-24T06:00:00Z'),
      ),
    ).toBe(false);
    expect(normalizeJalaliDate('۱۴۰۵/۸/۲')).toBe('1405/08/02');
  });

  it('بازه‌ی عبوری از نیمه‌شب', () => {
    const night = days.map((d) => ({
      ...d,
      open: true,
      start: '22:00',
      end: '02:00',
    }));
    expect(
      isWithinWorkingHours(night, new Set(), at('2026-10-24T20:00:00Z')),
    ).toBe(true); // ۲۳:۳۰
    expect(
      isWithinWorkingHours(night, new Set(), at('2026-10-24T21:00:00Z')),
    ).toBe(true); // ۰۰:۳۰ روز بعد
    expect(
      isWithinWorkingHours(night, new Set(), at('2026-10-24T09:00:00Z')),
    ).toBe(false);
  });

  it('خلاصه‌ی خوانا', () => {
    expect(describeWorkingHours(days)).toBe(
      'شنبه تا پنجشنبه 09:00 تا 18:00'.replace(
        'پنجشنبه 09:00 تا 18:00',
        'چهارشنبه 09:00 تا 18:00',
      ) + '، پنجشنبه 09:00 تا 13:00',
    );
  });
});
