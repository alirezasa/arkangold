// api/src/market/price-deviation.spec.ts
//
// کنترل انحراف قیمت منبع: جهش غیرعادی پذیرفته نمی‌شود و قفل قیمت تا تأیید با چند دریافت
// پیاپی سازگار متوقف است؛ حرکت عادی بازار بدون وقفه پذیرفته می‌شود.
import type Redis from 'ioredis';
import Decimal from 'decimal.js';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { PriceService } from './price.service';
import { FakeRedis } from '../common/testing/fake-redis';
import type { PrismaService } from '../prisma/prisma.service';
import type { SystemConfigService } from '../system-config/system-config.service';

const REFERENCE = 262_570_000; // ریال هر گرم

function setup(fetchedAgoMs = 30_000) {
  const redis = new FakeRedis();
  const reference = {
    pricePerGramRial: String(REFERENCE),
    fetchedAt: new Date(Date.now() - fetchedAgoMs),
    source: 'talasea.ir',
  };
  const prisma = {
    marketPrice: { findUnique: () => Promise.resolve(reference) },
  } as unknown as PrismaService;
  const systemConfig = {
    getNumber: (_k: string, fallback: number) => Promise.resolve(fallback),
  } as unknown as SystemConfigService;
  const svc = new PriceService(
    prisma,
    systemConfig,
    redis as unknown as Redis,
    { emit: () => true } as unknown as EventEmitter2,
  );
  const check = (rial: number) =>
    (
      svc as unknown as {
        passesDeviationCheck(p: Decimal): Promise<boolean>;
      }
    ).passesDeviationCheck(new Decimal(rial));
  return { svc, redis, check };
}

describe('PriceService deviation guard', () => {
  it('accepts normal market moves', async () => {
    const { check } = setup();
    expect(await check(REFERENCE * 1.02)).toBe(true);
  });

  it('rejects a sudden jump and suspends tradable quotes', async () => {
    const { svc, check } = setup();
    expect(await check(REFERENCE / 1000)).toBe(false);
    await expect(svc.getTradableGoldQuote()).resolves.toBeNull();
  });

  it('accepts a real move after consistent consecutive readings', async () => {
    const { redis, check } = setup();
    const moved = REFERENCE * 1.08;
    expect(await check(moved)).toBe(false);
    expect(await check(moved * 1.001)).toBe(false);
    expect(await check(moved * 0.999)).toBe(true);
    expect(redis.store.has('market:price:GOLD:suspect')).toBe(false);
  });

  it('restarts confirmation when readings disagree', async () => {
    const { check } = setup();
    expect(await check(REFERENCE * 1.1)).toBe(false);
    expect(await check(REFERENCE * 0.5)).toBe(false);
    expect(await check(REFERENCE * 1.1)).toBe(false);
  });

  it('accepts without comparison when the reference is stale', async () => {
    const { check } = setup(2 * 60 * 60 * 1000);
    expect(await check(REFERENCE * 1.5)).toBe(true);
  });
});
