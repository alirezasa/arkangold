import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron } from '@nestjs/schedule';
import axios, { isAxiosError } from 'axios';
import Decimal from 'decimal.js';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

const REDIS_KEY_GOLD = 'market:price:GOLD';
const REDIS_TTL_SECONDS = 35;
const GOLD_METAL = 'GOLD' as const;
const TALASEA_SOURCE = 'talasea.ir';
const TALASEA_API_URL = 'https://api.talasea.ir/api/market/getGoldPrice';

/** قیمت Talasea بر حسب «هزار تومان» است؛ ضرب در ۱۰٬۰۰۰ آن را ریالی می‌کند. */
const TALASEA_TO_RIAL_FACTOR = 10_000;
const RIAL_TO_TOMAN_DIVISOR = 10;

const MAX_HISTORY_HOURS = 2160; // 90 روز
const MAX_HISTORY_ROWS = 1000;

/**
 * Talasea فیلد `success` برنمی‌گرداند و اعداد را گاهی به‌صورت رشته می‌فرستد.
 * بنابراین هیچ فیلدی الزامی و هیچ نوعی قطعی فرض نمی‌شود.
 */
interface TalaseaRawResponse {
  price?: string | number | null;
  change24h?: string | number | null;
  disableBuy?: boolean | string | number | null;
  disableSell?: boolean | string | number | null;
}

interface TalaseaQuote {
  price: number;
  change24h: number;
  disableBuy: boolean;
  disableSell: boolean;
}

export interface CachedPricePayload {
  metal: typeof GOLD_METAL;
  pricePerGramRial: string;
  pricePerGramToman: string;
  change24h: number;
  source: string;
  fetchedAt: string;
  disableBuy: boolean;
  disableSell: boolean;
}

export interface GoldPriceResponse extends CachedPricePayload {
  fromCache: boolean;
}

export interface PriceHistoryItem {
  time: string;
  priceRial: string;
  priceToman: string;
}

export const PRICE_UPDATED_EVENT = 'market.price.updated';

/** تبدیل ایمن هر مقدار پشتیبانی‌شده به Decimal. */
function toDecimal(value: unknown): Decimal {
  if (value instanceof Decimal) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      const parsed = new Decimal(trimmed);
      if (parsed.isFinite()) {
        return parsed;
      }
    }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Decimal(value);
  }

  if (typeof value === 'bigint') {
    return new Decimal(value.toString());
  }

  // Prisma.Decimal و هر object با toString عددی
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toString?: unknown }).toString === 'function'
  ) {
    const asText = String(value).trim();
    if (asText.length > 0 && asText !== '[object Object]') {
      const parsed = new Decimal(asText);
      if (parsed.isFinite()) {
        return parsed;
      }
    }
  }

  throw new TypeError('مقدار عددی نامعتبر برای تبدیل به Decimal');
}

/** استخراج عدد از string/number؛ در صورت نامعتبر بودن null. */
function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().replace(/,/g, '');
    if (normalized.length === 0) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** استخراج boolean از boolean/string/number. */
function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', ''].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

@Injectable()
export class PriceService implements OnModuleInit {
  private readonly logger = new Logger(PriceService.name);

  private consecutiveFailures = 0;
  private readonly MAX_FAILURES_BEFORE_BACKOFF = 5;
  private readonly BACKOFF_MS = 5 * 60 * 1000;
  private circuitOpenedAt: number | null = null;
  private isFetching = false;

  constructor(
    private readonly prisma: PrismaService,

    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,

    private readonly eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.fetchAndStorePrice();
  }

  @Cron('*/30 * * * * *')
  async fetchAndStorePrice(): Promise<void> {
    if (this.isFetching) {
      return;
    }

    if (this.isCircuitOpen()) {
      this.logger.warn(
        'Circuit breaker باز است؛ دریافت قیمت موقتاً متوقف شده است.',
      );
      return;
    }

    this.isFetching = true;

    try {
      const quote = await this.fetchFromTalasea();
      if (!quote) {
        return;
      }

      const fetchedAt = new Date();

      const priceRial = new Decimal(quote.price)
        .mul(TALASEA_TO_RIAL_FACTOR)
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

      // فیلد Decimal(18, 0) در Prisma؛ ارسال به‌صورت string از ناسازگاری نوع جلوگیری می‌کند.
      const priceRialText = priceRial.toFixed(0);

      await this.prisma.marketPrice.upsert({
        where: { metal: GOLD_METAL },
        create: {
          metal: GOLD_METAL,
          pricePerGramRial: priceRialText,
          source: TALASEA_SOURCE,
          fetchedAt,
        },
        update: {
          pricePerGramRial: priceRialText,
          source: TALASEA_SOURCE,
          fetchedAt,
        },
      });

      const payload: CachedPricePayload = {
        metal: GOLD_METAL,
        pricePerGramRial: priceRialText,
        pricePerGramToman: priceRial.div(RIAL_TO_TOMAN_DIVISOR).toString(),
        change24h: quote.change24h,
        source: TALASEA_SOURCE,
        fetchedAt: fetchedAt.toISOString(),
        disableBuy: quote.disableBuy,
        disableSell: quote.disableSell,
      };

      try {
        await this.redis.set(
          REDIS_KEY_GOLD,
          JSON.stringify(payload),
          'EX',
          REDIS_TTL_SECONDS,
        );
      } catch (error) {
        this.logger.warn(
          `ذخیره قیمت در Redis ناموفق بود: ${getErrorMessage(error)}`,
        );
      }

      this.eventEmitter.emit(PRICE_UPDATED_EVENT, payload);
    } catch (error) {
      this.logger.error(
        `خطا در ذخیره‌سازی قیمت طلا: ${getErrorMessage(error)}`,
      );
    } finally {
      this.isFetching = false;
    }
  }

  @Cron('0 */5 * * * *')
  async recordPriceHistory(): Promise<void> {
    try {
      const current = await this.getCurrentGoldPriceDecimal();
      if (!current) {
        return;
      }

      await this.prisma.priceHistory.create({
        data: {
          metal: GOLD_METAL,
          pricePerGramRial: current
            .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
            .toFixed(0),
        },
      });
    } catch (error) {
      this.logger.error(
        `ثبت تاریخچه قیمت ناموفق بود: ${getErrorMessage(error)}`,
      );
    }
  }

  @Cron('0 0 3 * * *')
  async cleanupOldPriceHistory(): Promise<void> {
    try {
      const cutoff = new Date(Date.now() - MAX_HISTORY_HOURS * 60 * 60 * 1000);

      const result = await this.prisma.priceHistory.deleteMany({
        where: {
          recordedAt: {
            lt: cutoff,
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`${result.count} رکورد قدیمی تاریخچه قیمت حذف شد.`);
      }
    } catch (error) {
      this.logger.error(
        `پاک‌سازی تاریخچه قیمت ناموفق بود: ${getErrorMessage(error)}`,
      );
    }
  }

  /** قیمت جاری هر گرم به ریال؛ اول Redis، سپس fallback روی دیتابیس. */
  async getCurrentGoldPriceDecimal(): Promise<Decimal | null> {
    try {
      const cached = await this.redis.get(REDIS_KEY_GOLD);
      const payload = parseCachedPayload(cached);

      if (payload) {
        return toDecimal(payload.pricePerGramRial);
      }
    } catch (error) {
      this.logger.warn(
        `خواندن قیمت از Redis ناموفق بود: ${getErrorMessage(error)}`,
      );
    }

    const record = await this.prisma.marketPrice.findUnique({
      where: { metal: GOLD_METAL },
    });

    if (!record) {
      return null;
    }

    const priceRial = toDecimal(record.pricePerGramRial);

    const fallbackPayload: CachedPricePayload = {
      metal: GOLD_METAL,
      pricePerGramRial: priceRial.toFixed(0),
      pricePerGramToman: priceRial.div(RIAL_TO_TOMAN_DIVISOR).toString(),
      change24h: 0,
      source: record.source ?? 'db-fallback',
      fetchedAt: record.fetchedAt.toISOString(),
      disableBuy: false,
      disableSell: false,
    };

    try {
      await this.redis.set(
        REDIS_KEY_GOLD,
        JSON.stringify(fallbackPayload),
        'EX',
        REDIS_TTL_SECONDS,
      );
    } catch {
      // cache اختیاری است؛ نبودش مانع پاسخ‌دهی نمی‌شود.
    }

    return priceRial;
  }

  /** پاسخ آماده برای MarketController. */
  async getGoldPriceResponse(): Promise<GoldPriceResponse | null> {
    try {
      const cached = await this.redis.get(REDIS_KEY_GOLD);
      const payload = parseCachedPayload(cached);

      if (payload) {
        return { ...payload, fromCache: true };
      }
    } catch (error) {
      this.logger.warn(
        `خواندن قیمت از Redis ناموفق بود: ${getErrorMessage(error)}`,
      );
    }

    const record = await this.prisma.marketPrice.findUnique({
      where: { metal: GOLD_METAL },
    });

    if (!record) {
      return null;
    }

    const priceRial = toDecimal(record.pricePerGramRial);

    return {
      metal: GOLD_METAL,
      pricePerGramRial: priceRial.toFixed(0),
      pricePerGramToman: priceRial.div(RIAL_TO_TOMAN_DIVISOR).toString(),
      change24h: 0,
      source: record.source ?? 'db-fallback',
      fetchedAt: record.fetchedAt.toISOString(),
      disableBuy: false,
      disableSell: false,
      fromCache: false,
    };
  }

  async getPriceHistory(hours = 24): Promise<PriceHistoryItem[]> {
    const normalizedHours = Number.isFinite(hours)
      ? Math.min(Math.max(Math.trunc(hours), 1), MAX_HISTORY_HOURS)
      : 24;

    const since = new Date(Date.now() - normalizedHours * 60 * 60 * 1000);

    const records = await this.prisma.priceHistory.findMany({
      where: {
        metal: GOLD_METAL,
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: 'asc' },
      take: MAX_HISTORY_ROWS,
    });

    return records.map((record) => {
      const priceRial = toDecimal(record.pricePerGramRial);

      return {
        time: record.recordedAt.toISOString(),
        priceRial: priceRial.toString(),
        priceToman: priceRial.div(RIAL_TO_TOMAN_DIVISOR).toString(),
      };
    });
  }

  private isCircuitOpen(): boolean {
    if (this.circuitOpenedAt === null) {
      return false;
    }

    if (Date.now() - this.circuitOpenedAt >= this.BACKOFF_MS) {
      this.circuitOpenedAt = null;
      this.consecutiveFailures = 0;
      this.logger.log('Circuit breaker بسته شد؛ تلاش مجدد آغاز می‌شود.');
      return false;
    }

    return true;
  }

  private registerFailure(reason: string): void {
    this.consecutiveFailures += 1;
    this.logger.warn(
      `دریافت قیمت Talasea ناموفق (${this.consecutiveFailures}/${this.MAX_FAILURES_BEFORE_BACKOFF}): ${reason}`,
    );

    if (
      this.consecutiveFailures >= this.MAX_FAILURES_BEFORE_BACKOFF &&
      this.circuitOpenedAt === null
    ) {
      this.circuitOpenedAt = Date.now();
      this.logger.error(
        `Circuit breaker باز شد؛ تلاش بعدی پس از ${this.BACKOFF_MS / 1000} ثانیه.`,
      );
    }
  }

  private async fetchFromTalasea(): Promise<TalaseaQuote | null> {
    try {
      const response = await axios.get<unknown>(TALASEA_API_URL, {
        timeout: 8000,
        headers: { Accept: 'application/json' },
      });

      const body: unknown = response.data;
      if (!isRecord(body)) {
        this.registerFailure('ساختار پاسخ API معتبر نیست.');
        return null;
      }

      // برخی پاسخ‌ها داده را داخل data/result قرار می‌دهند.
      const container: Record<string, unknown> = isRecord(body.data)
        ? body.data
        : isRecord(body.result)
          ? body.result
          : body;

      const raw = container as TalaseaRawResponse;

      const price = parseNumeric(raw.price);
      if (price === null || price <= 0) {
        this.registerFailure(
          `مقدار price نامعتبر است: ${JSON.stringify(raw.price)}`,
        );
        return null;
      }

      const quote: TalaseaQuote = {
        price,
        change24h: parseNumeric(raw.change24h) ?? 0,
        disableBuy: parseBoolean(raw.disableBuy),
        disableSell: parseBoolean(raw.disableSell),
      };

      this.consecutiveFailures = 0;
      this.circuitOpenedAt = null;

      return quote;
    } catch (error) {
      this.registerFailure(
        isAxiosError(error)
          ? getAxiosErrorMessage(error)
          : getErrorMessage(error),
      );
      return null;
    }
  }
}

function parseCachedPayload(raw: string | null): CachedPricePayload | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isCachedPricePayload(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isCachedPricePayload(value: unknown): value is CachedPricePayload {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.metal === GOLD_METAL &&
    typeof value.pricePerGramRial === 'string' &&
    typeof value.pricePerGramToman === 'string' &&
    typeof value.change24h === 'number' &&
    typeof value.source === 'string' &&
    typeof value.fetchedAt === 'string' &&
    typeof value.disableBuy === 'boolean' &&
    typeof value.disableSell === 'boolean'
  );
}

function getAxiosErrorMessage(error: unknown): string {
  if (!isAxiosError(error)) {
    return getErrorMessage(error);
  }

  const status = error.response?.status;
  const statusText = error.response?.statusText;

  if (status !== undefined) {
    return `HTTP ${status}${statusText ? ` ${statusText}` : ''} - ${error.message}`;
  }

  return error.message;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'خطای ناشناخته';
}
