// قیمت‌گذاری و اعتبارسنجی‌های بازخرید شمش (بدون دیتابیس)
import Decimal from 'decimal.js';
import { BadRequestException } from '@nestjs/common';
import { BuybackService } from './buyback.service';

function setup(config: Record<string, string> = {}) {
  const values: Record<string, string> = {
    'buyback.enabled': 'true',
    'buyback.deduction_percent': '2',
    'buyback.fee_rial': '0',
    'buyback.offer_validity_hours': '24',
    ...config,
  };
  const systemConfig = {
    get: jest.fn((k: string, f = '') => Promise.resolve(values[k] ?? f)),
    getNumber: jest.fn((k: string, f = 0) =>
      Promise.resolve(values[k] != null ? Number(values[k]) : f),
    ),
    getBoolean: jest.fn((k: string, f = false) =>
      Promise.resolve(values[k] != null ? values[k] === 'true' : f),
    ),
    getDecimal: jest.fn((k: string, f: string) =>
      Promise.resolve(new Decimal(values[k] ?? f)),
    ),
  };
  // قیمت ۱۸ عیار: ۱۰٬۰۰۰٬۰۰۰ ریال؛ ۲۴ عیار = ۲۴/۱۸ برابر
  const pricing = {
    getGoldPricePerGram: jest.fn((karat: string) =>
      Promise.resolve(
        karat === 'K18'
          ? new Decimal(10_000_000)
          : new Decimal(10_000_000).times(24).div(18),
      ),
    ),
  };
  const service = new BuybackService(
    {} as never,
    systemConfig as never,
    {} as never,
    pricing as never,
    {} as never,
    {} as never,
  );
  return { service, pricing };
}

describe('BuybackService.computePrice', () => {
  it('قیمت بر اساس عیار اندازه‌گیری‌شده (هزارم) از قیمت ۱۸ عیار محاسبه می‌شود', async () => {
    const { service } = setup();
    const p = await service.computePrice({
      weightGrams: '10',
      purityKarat: 'K24',
      fineness: '995',
    });
    // 10,000,000 × 995 / 750 = 13,266,666 (کف)
    expect(p.priceBasis).toBe('FINENESS');
    expect(p.pricePerGramRial).toBe('13266666');
    expect(p.grossRial).toBe('132666660');
    // کسر ۲٪ = 2,653,333 → خالص 130,013,327 → گرد به پایین مضرب ۱۰۰۰
    expect(p.deductionRial).toBe('2653333');
    expect(p.netRial).toBe('130013000');
  });

  it('بدون عیار اندازه‌گیری‌شده از قیمت عیار ثبت‌شده‌ی شمش استفاده می‌کند', async () => {
    const { service, pricing } = setup({ 'buyback.fee_rial': '500000' });
    const p = await service.computePrice({
      weightGrams: '1',
      purityKarat: 'K24',
    });
    expect(pricing.getGoldPricePerGram).toHaveBeenCalledWith('K24');
    expect(p.priceBasis).toBe('KARAT');
    expect(p.feeRial).toBe('500000');
    // 13,333,333 − 266,666 − 500,000 = 12,566,667 → 12,566,000
    expect(p.netRial).toBe('12566000');
  });

  it('قیمت دستی و درصد کسر دلخواه کارشناس را می‌پذیرد', async () => {
    const { service, pricing } = setup();
    const p = await service.computePrice({
      weightGrams: '2.5',
      purityKarat: 'K24',
      pricePerGramRial: 12_000_000,
      deductionPercent: 0,
      feeRial: 0,
    });
    expect(pricing.getGoldPricePerGram).not.toHaveBeenCalled();
    expect(p.priceBasis).toBe('MANUAL');
    expect(p.netRial).toBe('30000000');
  });

  it('مبلغ خالص هرگز منفی نمی‌شود', async () => {
    const { service } = setup({ 'buyback.fee_rial': '999999999' });
    const p = await service.computePrice({
      weightGrams: '0.1',
      purityKarat: 'K18',
    });
    expect(p.netRial).toBe('0');
  });
});

describe('BuybackService.inspect (اعتبارسنجی پیش از تراکنش)', () => {
  const checklist = {
    hologramIntact: true,
    serialMatches: true,
    packagingIntact: true,
    surfaceIntact: true,
    purityTestPassed: true,
  };

  it('تأیید اصالت با چک‌لیست ناقص رد می‌شود', async () => {
    const { service } = setup();
    await expect(
      service.inspect('admin', 'id', {
        passed: true,
        checklist: { ...checklist, serialMatches: false },
        measuredWeightGrams: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('تأیید اصالت بدون وزن اندازه‌گیری‌شده رد می‌شود', async () => {
    const { service } = setup();
    await expect(
      service.inspect('admin', 'id', { passed: true, checklist }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('نتیجه‌ی ناموفق بدون دلیل رد می‌شود', async () => {
    const { service } = setup();
    await expect(
      service.inspect('admin', 'id', { passed: false, checklist }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
