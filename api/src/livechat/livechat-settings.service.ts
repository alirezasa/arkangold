// api/src/livechat/livechat-settings.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemConfigService } from '../system-config/system-config.service';
import { Prisma } from '../generated/prisma';
import {
  DEFAULT_LIVECHAT_SETTINGS,
  LivechatSettingsData,
  WorkingDay,
  WeekdayIndex,
  mergeSettings,
} from './livechat-settings.types';
import {
  describeWorkingHours,
  isWithinWorkingHours,
  normalizeJalaliDate,
  parseHHmm,
} from './livechat-hours.util';
import { normalizeIranMobile } from '../integrations/providers/sms-common/sms-live.util';
import { parseHolidays, toEnglishDigits } from '../common/utils/jalali.util';

const CACHE_MS = 30_000;
const COLOR = /^#[0-9a-fA-F]{6}$/;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
const text = (v: string, max: number) =>
  (v ?? '').toString().trim().slice(0, max);
const list = (v: string[], max: number, itemMax = 200) =>
  [
    ...new Set((v ?? []).map((x) => text(String(x), itemMax)).filter(Boolean)),
  ].slice(0, max);

/** پاک‌سازی تنظیمات ورودی ادمین (پس از ادغام نوع‌ها با پیش‌فرض) */
export function sanitizeSettings(
  s: LivechatSettingsData,
): LivechatSettingsData {
  const d = DEFAULT_LIVECHAT_SETTINGS;
  const w = s.widget;
  w.primaryColor = COLOR.test(w.primaryColor)
    ? w.primaryColor
    : d.widget.primaryColor;
  w.accentColor = COLOR.test(w.accentColor)
    ? w.accentColor
    : d.widget.accentColor;
  w.position = w.position === 'right' ? 'right' : 'left';
  w.offsetX = clamp(w.offsetX, 0, 200);
  w.offsetBottom = clamp(w.offsetBottom, 0, 300);
  w.hiddenPaths = list(w.hiddenPaths, 50).filter((p) => p.startsWith('/'));
  for (const k of [
    'title',
    'subtitle',
    'offlineSubtitle',
    'launcherText',
    'composerPlaceholder',
  ] as const) {
    w[k] = text(w[k], 120);
  }
  w.welcomeMessage = text(w.welcomeMessage, 1000);

  s.bot.freeTextBehavior = (['smart', 'handoff', 'menu'] as const).includes(
    s.bot.freeTextBehavior,
  )
    ? s.bot.freeTextBehavior
    : 'smart';
  s.smart.minConfidence = clamp(s.smart.minConfidence, 0.2, 1);
  s.smart.suggestThreshold = clamp(
    s.smart.suggestThreshold,
    0.1,
    s.smart.minConfidence,
  );
  s.smart.maxSuggestions = Math.round(clamp(s.smart.maxSuggestions, 0, 6));
  s.smart.handoffKeywords = list(s.smart.handoffKeywords, 50, 60);

  s.routing.mode = s.routing.mode === 'manual' ? 'manual' : 'auto';
  s.routing.autoCloseMinutes = Math.round(
    clamp(s.routing.autoCloseMinutes, 0, 24 * 60),
  );
  s.routing.queueTimeoutSeconds = Math.round(
    clamp(s.routing.queueTimeoutSeconds, 0, 3600),
  );

  const days: WorkingDay[] = [];
  for (let day = 0 as WeekdayIndex; day < 7; day = (day + 1) as WeekdayIndex) {
    const src = s.workingHours.days.find((x) => x && Number(x.day) === day);
    const def = d.workingHours.days[day];
    const start =
      src && parseHHmm(String(src.start)) != null
        ? toEnglishDigits(String(src.start))
        : def.start;
    const end =
      src && parseHHmm(String(src.end)) != null
        ? toEnglishDigits(String(src.end))
        : def.end;
    days.push({ day, open: src ? !!src.open : def.open, start, end });
  }
  s.workingHours.days = days;
  s.workingHours.holidays = list(s.workingHours.holidays, 200)
    .map(normalizeJalaliDate)
    .filter((x): x is string => !!x);

  s.offline.mode = (['form', 'message', 'hide'] as const).includes(
    s.offline.mode,
  )
    ? s.offline.mode
    : 'form';
  s.notifications.smsCooldownMinutes = Math.round(
    clamp(s.notifications.smsCooldownMinutes, 0, 24 * 60),
  );
  s.notifications.adminPhones = list(s.notifications.adminPhones, 20)
    .map((p) => normalizeIranMobile(toEnglishDigits(p)))
    .filter((p): p is string => !!p);
  s.notifications.chatLink = /^https?:\/\//.test(s.notifications.chatLink)
    ? text(s.notifications.chatLink, 300)
    : d.notifications.chatLink;
  s.privacy.maxMessageLength = Math.round(
    clamp(s.privacy.maxMessageLength, 100, 5000),
  );
  s.privacy.ipBlocklist = list(s.privacy.ipBlocklist, 500, 64);
  return limitStrings(s, 2000);
}

/** سقف طول همه‌ی متن‌های تنظیمات */
function limitStrings<T>(value: T, max: number): T {
  if (typeof value === 'string') return value.slice(0, max) as T;
  if (Array.isArray(value))
    return (value as unknown[]).map((v) => limitStrings(v, max)) as T;
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      (value as Record<string, unknown>)[k] = limitStrings(v, max);
    }
  }
  return value;
}

@Injectable()
export class LivechatSettingsService {
  private cache: { at: number; value: LivechatSettingsData } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemConfig: SystemConfigService,
  ) {}

  async get(): Promise<LivechatSettingsData> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS)
      return this.cache.value;
    const row = await this.prisma.livechatSettings.findUnique({
      where: { id: 1 },
    });
    const value = mergeSettings(DEFAULT_LIVECHAT_SETTINGS, row?.data ?? {});
    this.cache = { at: Date.now(), value };
    return value;
  }

  async update(
    patch: unknown,
    adminUserId: string,
  ): Promise<LivechatSettingsData> {
    const current = await this.get();
    // ادغام: ابتدا وضعیت فعلی، سپس تغییرات ادمین روی آن (کلیدهای ناشناخته حذف می‌شوند)
    const merged = sanitizeSettings(
      mergeSettings(current, deepMerge(structuredClone(current), patch)),
    );
    const data = merged as unknown as Prisma.InputJsonValue;
    await this.prisma.livechatSettings.upsert({
      where: { id: 1 },
      create: { id: 1, data, updatedById: adminUserId },
      update: { data, updatedById: adminUserId },
    });
    this.cache = { at: Date.now(), value: merged };
    return merged;
  }

  async holidays(s?: LivechatSettingsData): Promise<Set<string>> {
    const settings = s ?? (await this.get());
    const set = new Set(settings.workingHours.holidays);
    if (settings.workingHours.useSystemHolidays) {
      const stored: unknown = await this.systemConfig
        .find('calendar.holidays')
        .catch(() => null);
      const raw = typeof stored === 'string' ? stored : null;
      for (const h of parseHolidays(raw)) {
        const n = normalizeJalaliDate(h);
        if (n) set.add(n);
      }
    }
    return set;
  }

  async isWorkingTime(date = new Date()): Promise<boolean> {
    const s = await this.get();
    if (!s.workingHours.enabled) return true;
    return isWithinWorkingHours(
      s.workingHours.days,
      await this.holidays(s),
      date,
    );
  }

  async workingHoursText(): Promise<string> {
    const s = await this.get();
    return s.workingHours.enabled
      ? describeWorkingHours(s.workingHours.days)
      : 'همه‌ی روزها، شبانه‌روزی';
  }
}

function deepMerge(target: unknown, patch: unknown): unknown {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  if (!target || typeof target !== 'object' || Array.isArray(target))
    return patch;
  const out = target as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = deepMerge(out[k], v);
  }
  return out;
}
