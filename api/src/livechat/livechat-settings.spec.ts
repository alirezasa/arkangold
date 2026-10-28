import {
  DEFAULT_LIVECHAT_SETTINGS,
  mergeSettings,
} from './livechat-settings.types';
import { sanitizeSettings } from './livechat-settings.service';

describe('livechat settings', () => {
  it('ادغام با پیش‌فرض‌ها: کلید ناشناخته و نوع نادرست نادیده گرفته می‌شود', () => {
    const s = mergeSettings(DEFAULT_LIVECHAT_SETTINGS, {
      enabled: 'yes',
      unknown: 1,
      widget: { title: 'عنوان', offsetX: '12' },
      bot: { greeting: 'سلام' },
    });
    expect(s.enabled).toBe(true);
    expect((s as unknown as Record<string, unknown>).unknown).toBeUndefined();
    expect(s.widget.title).toBe('عنوان');
    expect(s.widget.offsetX).toBe(DEFAULT_LIVECHAT_SETTINGS.widget.offsetX);
    expect(s.bot.greeting).toBe('سلام');
    expect(s.bot.mainMenuLabel).toBe(
      DEFAULT_LIVECHAT_SETTINGS.bot.mainMenuLabel,
    );
  });

  it('پاک‌سازی: رنگ، ساعت، شماره‌ها، نشانی و سقف‌ها', () => {
    const s = mergeSettings(DEFAULT_LIVECHAT_SETTINGS, {});
    s.widget.primaryColor = 'red;background:url(x)';
    s.widget.offsetX = 9999;
    s.workingHours.days = [
      { day: 0, open: true, start: '۰۸:۳۰', end: 'bad' },
    ] as typeof s.workingHours.days;
    s.notifications.adminPhones = ['۰۹۱۲۱۲۳۴۵۶۷', 'abc'];
    s.notifications.chatLink = 'javascript:alert(1)';
    s.smart.minConfidence = 5;
    const out = sanitizeSettings(s);
    expect(out.widget.primaryColor).toBe(
      DEFAULT_LIVECHAT_SETTINGS.widget.primaryColor,
    );
    expect(out.widget.offsetX).toBe(200);
    expect(out.workingHours.days).toHaveLength(7);
    expect(out.workingHours.days[0]).toEqual({
      day: 0,
      open: true,
      start: '08:30',
      end: '18:00',
    });
    expect(out.notifications.adminPhones).toEqual(['09121234567']);
    expect(out.notifications.chatLink).toBe(
      DEFAULT_LIVECHAT_SETTINGS.notifications.chatLink,
    );
    expect(out.smart.minConfidence).toBe(1);
  });
});
