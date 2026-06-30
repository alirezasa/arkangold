import {
  Injectable,
  Logger,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

import { Prisma } from '../generated/prisma/client';
import Redis from 'ioredis';
import axios from 'axios';
import { PriceGateway } from './price.gateway';

const REDIS_KEY_GOLD = 'market:price:GOLD';
const REDIS_TTL = 35;

interface TalaseaResponse {
  success: boolean;
  price: number; // هزار تومان/گرم
  change24h: number;
  disableBuy?: boolean;
  disableSell?: boolean;
}

interface PriceData {
  pricePerGramRial: number;
  pricePerGramToman: number;
  change24h: number;
  source: string;
  fetchedAt: string;
  disableBuy: boolean;
  disableSell: boolean;
}

@Injectable()
export class PriceService implements OnModuleInit {
  private readonly logger = new Logger(PriceService.name);
  private lastChange24h = 0;

  constructor(
    private prisma: PrismaService,
    @Inject('REDIS_CLIENT') private redis: Redis,
    // forwardRef برای جلوگیری از circular dependency
    @Inject(forwardRef(() => PriceGateway))
    private priceGateway: PriceGateway,
  ) {}

  async onModuleInit() {
    await this.fetchAndStorePrices();
  }

  // ── هر ۳۰ ثانیه ──
  @Cron('*/30 * * * * *')
  async fetchAndStorePrices() {
    try {
      const talasea = await this.fetchFromTalasea();
      if (!talasea) return;

      const priceRial = talasea.price * 10_000;
      this.lastChange24h = talasea.change24h ?? 0;

      // ذخیره در DB
      await this.prisma.marketPrice.create({
        data: {
          metal: 'GOLD',
          pricePerGramRial: new Decimal(priceRial),
          source: 'talasea.ir',
        },
      });

      // ذخیره در Redis
      const payload: PriceData = {
        pricePerGramRial: priceRial,
        pricePerGramToman: priceRial / 10,
        change24h: talasea.change24h ?? 0,
        source: 'talasea.ir',
        fetchedAt: new Date().toISOString(),
        disableBuy: talasea.disableBuy ?? false,
        disableSell: talasea.disableSell ?? false,
      };
      await this.redis.setex(
        REDIS_KEY_GOLD,
        REDIS_TTL,
        JSON.stringify(payload),
      );

      // ── Broadcast از طریق WebSocket ──
      this.priceGateway.broadcastPrice(payload);

      this.logger.debug(
        `[Price] GOLD: ${(priceRial / 10).toLocaleString()} تومان/گرم | ws broadcast ✓`,
      );
    } catch (err) {
      this.logger.error('[Price] خطا در دریافت قیمت:', err);
    }
  }

  // ── هر ۵ دقیقه snapshot ──
  @Cron('*/5 * * * *')
  async recordPriceHistory() {
    try {
      const goldPrice = await this.getCurrentGoldPrice();
      if (!goldPrice) return;

      await this.prisma.priceHistory.create({
        data: {
          metal: 'GOLD',
          pricePerGramRial: new Decimal(goldPrice),
        },
      });
      this.logger.debug(`[PriceHistory] snapshot GOLD: ${goldPrice}`);
    } catch (err) {
      this.logger.error('[PriceHistory] خطا:', err);
    }
  }

  // ── خواندن قیمت فعلی (Redis → DB) ──
  async getCurrentGoldPrice(): Promise<number | null> {
    try {
      const cached = await this.redis.get(REDIS_KEY_GOLD);
      if (cached) {
        return (JSON.parse(cached) as PriceData).pricePerGramRial;
      }
      const latest = await this.prisma.marketPrice.findFirst({
        where: { metal: 'GOLD' },
        orderBy: { fetchedAt: 'desc' },
      });
      if (latest) {
        const p = Number(latest.pricePerGramRial);
        const payload: PriceData = {
          pricePerGramRial: p,
          pricePerGramToman: p / 10,
          change24h: this.lastChange24h,
          source: latest.source ?? 'db',
          fetchedAt: latest.fetchedAt.toISOString(),
          disableBuy: false,
          disableSell: false,
        };
        await this.redis.setex(
          REDIS_KEY_GOLD,
          REDIS_TTL,
          JSON.stringify(payload),
        );
        return p;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ── پاسخ کامل API ──
  async getGoldPriceResponse() {
    const cached = await this.redis.get(REDIS_KEY_GOLD);
    if (cached) {
      return { ...(JSON.parse(cached) as PriceData), fromCache: true };
    }
    const latest = await this.prisma.marketPrice.findFirst({
      where: { metal: 'GOLD' },
      orderBy: { fetchedAt: 'desc' },
    });
    if (!latest) return null;
    const p = Number(latest.pricePerGramRial);
    return {
      pricePerGramRial: p,
      pricePerGramToman: p / 10,
      change24h: this.lastChange24h,
      source: latest.source,
      fetchedAt: latest.fetchedAt.toISOString(),
      disableBuy: false,
      disableSell: false,
      fromCache: false,
    };
  }

  // ── تاریخچه نمودار ──
  async getPriceHistory(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);
    const records = await this.prisma.priceHistory.findMany({
      where: { metal: 'GOLD', recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      take: 500,
    });
    return records.map((r) => ({
      time: r.recordedAt.toISOString(),
      priceRial: Number(r.pricePerGramRial),
      priceToman: Number(r.pricePerGramRial) / 10,
    }));
  }

  // ── fetch از talasea ──
  private async fetchFromTalasea(): Promise<TalaseaResponse | null> {
    try {
      const res = await axios.get<TalaseaResponse>(
        'https://api.talasea.ir/api/market/getGoldPrice',
        { timeout: 8000 },
      );
      if (res.data?.price) return res.data;
      return null;
    } catch {
      this.logger.warn('[Price] talasea در دسترس نیست');
      return null;
    }
  }
}
