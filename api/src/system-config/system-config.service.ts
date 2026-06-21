import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WALLET_CONFIG_DEFAULTS } from './system-config.seed';

@Injectable()
export class SystemConfigService implements OnModuleInit {
  private readonly logger = new Logger(SystemConfigService.name);
  private cache = new Map<string, string>();
  private cacheLoadedAt = 0;
  private readonly CACHE_TTL = 60_000; // 1 دقیقه

  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.loadCache();
  }

  // ── Seed مقادیر پیش‌فرض اگر وجود نداشتند ──
  private async seedDefaults() {
    for (const item of WALLET_CONFIG_DEFAULTS) {
      await this.prisma.systemConfig.upsert({
        where: { key: item.key },
        create: item,
        update: { description: item.description }, // فقط description آپدیت بشه، value دست نزنه
      });
    }
    this.logger.log(
      `[SystemConfig] ${WALLET_CONFIG_DEFAULTS.length} کانفیگ پیش‌فرض seed شد`,
    );
  }

  // ── بارگذاری کش ──
  private async loadCache() {
    const configs = await this.prisma.systemConfig.findMany();
    this.cache.clear();
    for (const c of configs) {
      this.cache.set(c.key, c.value);
    }
    this.cacheLoadedAt = Date.now();
  }

  // ── دریافت مقدار ──
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

  async getBoolean(key: string, fallback = false): Promise<boolean> {
    const val = await this.get(key);
    if (!val) return fallback;
    return val === 'true' || val === '1';
  }

  // ── دریافت همه کانفیگ‌های یک prefix ──
  async getGroup(prefix: string): Promise<Record<string, string>> {
    if (Date.now() - this.cacheLoadedAt > this.CACHE_TTL) {
      await this.loadCache();
    }
    const result: Record<string, string> = {};
    for (const [k, v] of this.cache.entries()) {
      if (k.startsWith(prefix)) {
        result[k] = v;
      }
    }
    return result;
  }

  // ── آپدیت (برای ادمین) ──
  async set(key: string, value: string): Promise<void> {
    await this.prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
    this.cache.set(key, value); // کش رو هم آپدیت کن
  }

  // ── دریافت همه برای ادمین ──
  async getAll() {
    return this.prisma.systemConfig.findMany({
      orderBy: { key: 'asc' },
    });
  }

  // ── پاک کردن کش (برای force refresh) ──
  async invalidateCache() {
    this.cacheLoadedAt = 0;
    await this.loadCache();
  }
}
