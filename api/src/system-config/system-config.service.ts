// api/src/system-config/system-config.service.ts

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import { WALLET_CONFIG_DEFAULTS } from './system-config.seed';

// کلیدهای منسوخ‌شده که باید در استارت‌آپ از دیتابیس پاک شوند (مثلاً پس از
// حذف یک قابلیت) تا در پنل ادمین به‌صورت تنظیم بلااستفاده باقی نمانند
// محدوده‌ی مجاز زمان نشست‌ها — مقادیر خارج از بازه به نزدیک‌ترین حد برگردانده می‌شوند
// تا تنظیم اشتباه در پنل ادمین (مثلاً ۰ یا عدد بسیار بزرگ) امنیت/دسترسی را نشکند
const SESSION_LIMITS = {
  user: {
    timeoutKey: 'session.user.timeout_minutes',
    timeoutDefault: 15,
    timeoutMin: 5,
    timeoutMax: 1440,
    refreshKey: 'session.user.refresh_days',
    refreshDefault: 7,
    refreshMin: 1,
    refreshMax: 90,
    refreshUnitSeconds: 24 * 60 * 60,
  },
  admin: {
    timeoutKey: 'session.admin.timeout_minutes',
    timeoutDefault: 30,
    timeoutMin: 5,
    timeoutMax: 480,
    refreshKey: 'session.admin.refresh_hours',
    refreshDefault: 24,
    refreshMin: 1,
    refreshMax: 168,
    refreshUnitSeconds: 60 * 60,
  },
} as const;

export interface SessionPolicy {
  /** عمر توکن دسترسی و کوکی نشست (ثانیه) */
  accessTtlSeconds: number;
  /** عمر توکن تمدید و رکورد نشست (ثانیه) — هرگز کمتر از عمر توکن دسترسی نیست */
  refreshTtlSeconds: number;
}

const DEPRECATED_KEYS = [
  'transfer.daily_limit_rial',
  'transfer.monthly_limit_rial',
  // جایگزین با referral.reward_amount_mg (پاداش طلایی به میلی‌گرم)
  'referral.reward_amount_grams',
];

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);
  private cache = new Map<string, string>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL = 60_000; // 1 دقیقه

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.migrateReferralGramsToMg();
    await this.removeDeprecatedKeys();
    await this.loadCache();
  }

  private async seedDefaults() {
    for (const item of WALLET_CONFIG_DEFAULTS) {
      await this.prisma.systemConfig.upsert({
        where: { key: item.key },
        create: item,
        update: { description: item.description },
      });
    }
    this.logger.log(
      `[SystemConfig] ${WALLET_CONFIG_DEFAULTS.length} کانفیگ پیش‌فرض seed شد`,
    );
  }

  /** انتقال مقدار کلید منسوخ پاداش طلایی (گرم) به کلید جدید (میلی‌گرم) پیش از حذف آن */
  private async migrateReferralGramsToMg() {
    const [legacy, current] = await Promise.all([
      this.prisma.systemConfig.findUnique({
        where: { key: 'referral.reward_amount_grams' },
      }),
      this.prisma.systemConfig.findUnique({
        where: { key: 'referral.reward_amount_mg' },
      }),
    ]);
    const grams = parseFloat(legacy?.value ?? '');
    if (!legacy || !(grams > 0) || Number(current?.value ?? 0) > 0) return;
    await this.prisma.systemConfig.update({
      where: { key: 'referral.reward_amount_mg' },
      data: { value: String(Math.round(grams * 10000) / 10) },
    });
  }

  private async removeDeprecatedKeys() {
    if (DEPRECATED_KEYS.length === 0) return;
    const { count } = await this.prisma.systemConfig.deleteMany({
      where: { key: { in: DEPRECATED_KEYS } },
    });
    if (count > 0) {
      this.logger.log(`[SystemConfig] ${count} کانفیگ منسوخ‌شده حذف شد`);
    }
  }

  private async loadCache() {
    const configs = await this.prisma.systemConfig.findMany();
    this.cache.clear();
    for (const c of configs) {
      this.cache.set(c.key, c.value);
    }
    this.cacheLoadedAt = Date.now();
  }

  async get(key: string, fallback?: string): Promise<string> {
    if (Date.now() - this.cacheLoadedAt > this.CACHE_TTL) {
      await this.loadCache();
    }
    return this.cache.get(key) ?? fallback ?? '';
  }

  async getNumber(key: string, fallback = 0): Promise<number> {
    const val = await this.get(key);
    const num = parseFloat(val);
    return isNaN(num) ? fallback : num;
  }

  /**
   * دریافت مقدار به‌صورت Prisma.Decimal - باید برای همه محاسبات
   * مالی/معاملاتی استفاده شود (نه getNumber که دقت float دارد و
   * برای مبالغ بزرگ ریالی یا اعشار طلا قابل اعتماد نیست).
   */
  async getDecimal(key: string, fallback: string): Promise<Prisma.Decimal> {
    const val = await this.get(key);
    try {
      return new Prisma.Decimal(val || fallback);
    } catch {
      this.logger.warn(
        `[SystemConfig] مقدار نامعتبر برای ${key}="${val}", استفاده از fallback`,
      );
      return new Prisma.Decimal(fallback);
    }
  }

  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const val = await this.get(key);
    if (!val) return fallback;
    return val === 'true' || val === '1';
  }

  /** سیاست زمان نشست کاربران یا ادمین‌ها (قابل تنظیم از پنل ادمین) */
  async getSessionPolicy(kind: 'user' | 'admin'): Promise<SessionPolicy> {
    const l = SESSION_LIMITS[kind];
    const clamp = (v: number, min: number, max: number) =>
      Math.min(max, Math.max(min, Math.round(v)));

    const timeoutMinutes = clamp(
      await this.getNumber(l.timeoutKey, l.timeoutDefault),
      l.timeoutMin,
      l.timeoutMax,
    );
    const refreshUnits = clamp(
      await this.getNumber(l.refreshKey, l.refreshDefault),
      l.refreshMin,
      l.refreshMax,
    );

    const accessTtlSeconds = timeoutMinutes * 60;
    return {
      accessTtlSeconds,
      refreshTtlSeconds: Math.max(
        refreshUnits * l.refreshUnitSeconds,
        accessTtlSeconds,
      ),
    };
  }

  async getGroup(prefix: string): Promise<Record<string, string>> {
    if (Date.now() - this.cacheLoadedAt > this.CACHE_TTL) {
      await this.loadCache();
    }
    const result: Record<string, string> = {};
    for (const [k, v] of this.cache.entries()) {
      if (k.startsWith(prefix)) result[k] = v;
    }
    return result;
  }

  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    this.cache.set(key, value);
  }

  async getAll() {
    return this.prisma.systemConfig.findMany({ orderBy: { key: 'asc' } });
  }

  async invalidateCache() {
    this.cacheLoadedAt = 0;
    await this.loadCache();
  }
}
