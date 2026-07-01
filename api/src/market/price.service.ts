// api/src/market/price.service.ts
//
// نکات معماری (Prisma 7):
// - یک رکورد ثابت per metal در market_prices (upsert نه create) → جلوگیری از رشد نامحدود جدول
// - Cron lock (in-memory) برای جلوگیری از overlap اجرای همزمان
// - Circuit breaker برای talasea (بعد از N شکست، backoff)
// - EventEmitter به‌جای تزریق مستقیم Gateway (رفع circular dependency)
// - همه قیمت‌ها به صورت Decimal ذخیره و فقط در لایه presentation به Number تبدیل می‌شن

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import Redis from 'ioredis';
import axios, { AxiosError } from 'axios';
import { Inject } from '@nestjs/common';

const REDIS_KEY_GOLD = 'market:price:GOLD';
const REDIS_TTL_SECONDS = 35; // کمی بیشتر از فاصله cron (30s) برای پوشش jitter

interface TalaseaResponse {
  success: boolean;
  price: number; // هزار تومان به ازای هر گرم (طبق مستندات talasea)
  change24h: number;
  disableBuy?: boolean;
  disableSell?: boolean;
}

export interface CachedPricePayload {
  metal: 'GOLD';
  pricePerGramRial: string; // به صورت string serialize می‌شه (دقت Decimal حفظ بشه)
  pricePerGramToman: string;
  change24h: number;
  source: string;
  fetchedAt: string;
  disableBuy: boolean;
  disableSell: boolean;
}

export const PRICE_UPDATED_EVENT = 'market.price.updated';

@Injectable()
export class PriceService implements OnModuleInit {
  private readonly logger = new Logger(PriceService.name);

  // ── circuit breaker state ──
  private consecutiveFailures = 0;
  private readonly MAX_FAILURES_BEFORE_BACKOFF = 5;
  private readonly BACKOFF_MS = 5 * 60 * 1000; // 5 دقیقه
  private circuitOpenedAt: number | null = null;

  // ── cron overlap guard ──
  private isFetching = false;

  constructor(
    private readonly prisma: PrismaService,

    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    // اولین fetch بلافاصله بعد از بالا آمدن سرویس - بدون منتظر ماندن برای اولین cron tick
    await this.fetchAndStorePrice();
  }

  // ════════════════════════════════════════════════════════
  // Cron: هر ۳۰ ثانیه قیمت طلا را از talasea دریافت می‌کند
  // ════════════════════════════════════════════════════════
  @Cron('*/30 * * * * *', { name: 'fetch-gold-price' })
  async fetchAndStorePrice(): Promise<void> {
    // جلوگیری از اجرای همزمان (در صورتی که fetch قبلی هنوز تمام نشده)
    if (this.isFetching) {
      this.logger.warn('[Price] fetch قبلی هنوز در حال اجراست؛ این tick رد شد');
      return;
    }

    // circuit breaker: اگر اخیراً پشت‌سرهم fail شده، صبر کن
    if (this.isCircuitOpen()) {
      return;
    }

    this.isFetching = true;
    try {
      const talasea = await this.fetchFromTalasea();
      if (!talasea) return;

      // محاسبه با Decimal از همان ابتدا - بدون عبور از float
      // talasea.price واحدش هزار تومان است → ضرب در 10000 = ریال
      const priceRial = new Prisma.Decimal(talasea.price).times(10_000);

      // ── یک رکورد ثابت per metal (upsert) - بدون رشد نامحدود جدول ──
      await this.prisma.marketPrice.upsert({
        where: { metal: 'GOLD' },
        create: {
          metal: 'GOLD',
          pricePerGramRial: priceRial,
          source: 'talasea.ir',
        },
        update: {
          pricePerGramRial: priceRial,
          source: 'talasea.ir',
          fetchedAt: new Date(),
        },
      });

      const payload: CachedPricePayload = {
        metal: 'GOLD',
        pricePerGramRial: priceRial.toString(),
        pricePerGramToman: priceRial.dividedBy(10).toString(),
        change24h: talasea.change24h ?? 0,
        source: 'talasea.ir',
        fetchedAt: new Date().toISOString(),
        disableBuy: talasea.disableBuy ?? false,
        disableSell: talasea.disableSell ?? false,
      };

      await this.redis.setex(
        REDIS_KEY_GOLD,
        REDIS_TTL_SECONDS,
        JSON.stringify(payload),
      );

      // به‌جای تزریق مستقیم Gateway، event emit می‌کنیم (رفع circular dependency)
      this.eventEmitter.emit(PRICE_UPDATED_EVENT, payload);

      this.consecutiveFailures = 0;
      this.circuitOpenedAt = null;

      this.logger.debug(
        `[Price] GOLD به‌روزرسانی شد: ${payload.pricePerGramToman} تومان/گرم`,
      );
    } catch (err) {
      this.logger.error(
        '[Price] خطا در ذخیره قیمت:',
        err instanceof Error ? err.message : err,
      );
    } finally {
      this.isFetching = false;
    }
  }

  // ════════════════════════════════════════════════════════
  // Cron: هر ۵ دقیقه snapshot برای نمودار تاریخی
  // ════════════════════════════════════════════════════════
  @Cron('*/5 * * * *', { name: 'record-price-history' })
  async recordPriceHistory(): Promise<void> {
    try {
      const current = await this.getCurrentGoldPriceDecimal();
      if (!current) return;

      await this.prisma.priceHistory.create({
        data: {
          metal: 'GOLD',
          pricePerGramRial: current,
        },
      });
    } catch (err) {
      this.logger.error(
        '[PriceHistory] خطا:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ════════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════════
  // Cron: پاکسازی روزانه price_history قدیمی‌تر از 90 روز
  // (جلوگیری از رشد نامحدود جدول تاریخچه)
  // ════════════════════════════════════════════════════════
  @Cron('0 3 * * *', { name: 'cleanup-price-history' }) // هر شب ساعت 3 بامداد
  async cleanupOldPriceHistory(): Promise<void> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    try {
      const result = await this.prisma.priceHistory.deleteMany({
        where: { recordedAt: { lt: cutoff } },
      });
      if (result.count > 0) {
        this.logger.log(`[PriceHistory] ${result.count} رکورد قدیمی پاک شد`);
      }
    } catch (err) {
      this.logger.error(
        '[PriceHistory cleanup] خطا:',
        err instanceof Error ? err.message : err,
      );
    }
  }

  // ════════════════════════════════════════════════════════
  // خواندن قیمت فعلی به صورت Decimal (برای محاسبات داخلی - TradingService)
  // اولویت: Redis → DB (fallback) → null
  // ════════════════════════════════════════════════════════
  async getCurrentGoldPriceDecimal(): Promise<Prisma.Decimal | null> {
    try {
      const cached = await this.redis.get(REDIS_KEY_GOLD);
      if (cached) {
        const data = JSON.parse(cached) as CachedPricePayload;
        return new Prisma.Decimal(data.pricePerGramRial);
      }
    } catch (err) {
      this.logger.warn('[Price] خطا در خواندن Redis، fallback به DB', err);
    }

    // fallback به DB - این مسیر فقط زمانی اجرا میشه که Redis در دسترس نباشه
    const latest = await this.prisma.marketPrice.findUnique({
      where: { metal: 'GOLD' },
    });
    if (!latest) return null;

    // دوباره cache کن تا درخواست بعدی از Redis بخونه
    try {
      const payload: CachedPricePayload = {
        metal: 'GOLD',
        pricePerGramRial: latest.pricePerGramRial.toString(),
        pricePerGramToman: latest.pricePerGramRial.dividedBy(10).toString(),
        change24h: 0,
        source: latest.source ?? 'db-fallback',
        fetchedAt: latest.fetchedAt.toISOString(),
        disableBuy: false,
        disableSell: false,
      };
      await this.redis.setex(
        REDIS_KEY_GOLD,
        REDIS_TTL_SECONDS,
        JSON.stringify(payload),
      );
    } catch {
      // اگر Redis هم در دسترس نباشه، مشکلی نیست - فقط cache نمی‌شه
    }

    return latest.pricePerGramRial;
  }

  // ════════════════════════════════════════════════════════
  // پاسخ API عمومی - برای نمایش در فرانت (string برای حفظ دقت)
  // ════════════════════════════════════════════════════════
  async getGoldPriceResponse() {
    const cached: string | null = await this.redis.get(REDIS_KEY_GOLD);
    if (cached) {
      const data = JSON.parse(cached) as CachedPricePayload;
      return { ...data, fromCache: true };
    }

    const latest = await this.prisma.marketPrice.findUnique({
      where: { metal: 'GOLD' },
    });
    if (!latest) return null;

    return {
      metal: 'GOLD' as const,
      pricePerGramRial: latest.pricePerGramRial.toString(),
      pricePerGramToman: latest.pricePerGramRial.dividedBy(10).toString(),
      change24h: 0,
      source: latest.source ?? 'db-fallback',
      fetchedAt: latest.fetchedAt.toISOString(),
      disableBuy: false,
      disableSell: false,
      fromCache: false,
    };
  }

  async getPriceHistory(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const records = await this.prisma.priceHistory.findMany({
      where: { metal: 'GOLD', recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      take: 1000,
      select: { recordedAt: true, pricePerGramRial: true },
    });
    return records.map((r) => ({
      time: r.recordedAt.toISOString(),
      priceRial: r.pricePerGramRial.toString(),
      priceToman: r.pricePerGramRial.dividedBy(10).toString(),
    }));
  }

  // ════════════════════════════════════════════════════════
  // circuit breaker helpers
  // ════════════════════════════════════════════════════════
  private isCircuitOpen(): boolean {
    if (this.circuitOpenedAt === null) return false;
    const elapsed = Date.now() - this.circuitOpenedAt;
    if (elapsed > this.BACKOFF_MS) {
      // زمان backoff تمام شده، یک تلاش دیگر مجاز است
      this.circuitOpenedAt = null;
      this.consecutiveFailures = 0;
      return false;
    }
    return true;
  }

  private async fetchFromTalasea(): Promise<TalaseaResponse | null> {
    try {
      const res = await axios.get<TalaseaResponse>(
        'https://api.talasea.ir/api/market/getGoldPrice',
        { timeout: 8000 },
      );
      if (res.data?.price && res.data.price > 0) {
        this.consecutiveFailures = 0;
        return res.data;
      }
      throw new Error('پاسخ نامعتبر از talasea (قیمت صفر یا خالی)');
    } catch (err) {
      this.consecutiveFailures++;
      const isAxiosErr = err instanceof AxiosError;
      this.logger.warn(
        `[Price] تلاش ناموفق (${this.consecutiveFailures}/${this.MAX_FAILURES_BEFORE_BACKOFF}): ${
          isAxiosErr ? err.message : err
        }`,
      );

      if (this.consecutiveFailures >= this.MAX_FAILURES_BEFORE_BACKOFF) {
        this.circuitOpenedAt = Date.now();
        this.logger.error(
          `[Price] Circuit باز شد - تلاش بعدی بعد از ${this.BACKOFF_MS / 1000} ثانیه`,
        );
      }
      return null;
    }
  }
}
