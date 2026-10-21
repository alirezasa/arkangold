import {
  CalcMethod,
  CalcRate,
  CalcZone,
  computeRateFee,
  matchZones,
  quoteShippingOptions,
  resolveShippingCharge,
} from './shipping-calculator';
import { normalizeFa, resolveProvinceCode } from './iran-provinces';

const zone = (
  id: string,
  provinceCodes: string[],
  cities: string[] = [],
  sortOrder = 0,
): CalcZone => ({
  id,
  name: id,
  provinceCodes,
  cities,
  sortOrder,
});

const method = (
  id: string,
  type: CalcMethod['type'],
  extra: Partial<CalcMethod> = {},
): CalcMethod => ({
  id,
  code: id.toUpperCase(),
  name: id,
  type,
  description: null,
  carrierName: null,
  sortOrder: 0,
  requiresPostalCode: false,
  estimatedDays: null,
  pickupAddress: null,
  pickupHours: null,
  ...extra,
});

const rate = (
  methodId: string,
  zoneId: string,
  extra: Partial<CalcRate> = {},
): CalcRate => ({
  id: `${methodId}@${zoneId}`,
  methodId,
  zoneId,
  baseRial: 500_000,
  baseWeightGrams: 1000,
  stepRial: 200_000,
  stepWeightGrams: 1000,
  valuePercent: 0,
  minRial: null,
  maxRial: null,
  freeAboveRial: null,
  maxWeightGrams: null,
  maxOrderRial: null,
  feePayment: 'PREPAID',
  etaMinDays: null,
  etaMaxDays: null,
  isActive: true,
  ...extra,
});

const ZONES = [
  zone('tehran-city', ['TEHRAN'], ['تهران'], 1),
  zone('tehran-province', ['TEHRAN'], [], 2),
  zone('neighbors', ['ALBORZ', 'QOM'], [], 3),
  zone('rest', [], [], 9),
];
const METHODS = [
  method('courier', 'COURIER', { sortOrder: 1 }),
  method('post', 'POST', { sortOrder: 2, requiresPostalCode: true }),
  method('pickup', 'PICKUP', { sortOrder: 3 }),
];
const RATES = [
  rate('courier', 'tehran-city', { baseRial: 1_500_000, stepRial: 0 }),
  rate('post', 'tehran-province', { baseRial: 400_000 }),
  rate('post', 'rest', { baseRial: 700_000, stepRial: 250_000 }),
  rate('pickup', 'rest', { baseRial: 0, stepRial: 0 }),
];

describe('iran provinces', () => {
  it('normalizes Arabic letters, ZWNJ and «استان» prefix', () => {
    expect(normalizeFa('استان تهران ')).toBe(normalizeFa('تهران'));
    expect(normalizeFa('كرمانشاه')).toBe(normalizeFa('کرمانشاه'));
    expect(normalizeFa('خرم‌آباد')).toBe(normalizeFa('خرم آباد'));
  });

  it('resolves legacy free-text provinces', () => {
    expect(resolveProvinceCode({ province: 'استان فارس' })).toBe('FARS');
    expect(resolveProvinceCode({ province: 'اذربايجان شرقي' })).toBe(
      'AZARBAYJAN_SHARGHI',
    );
    expect(
      resolveProvinceCode({ provinceCode: 'TEHRAN', province: 'هرچه' }),
    ).toBe('TEHRAN');
    expect(resolveProvinceCode({ province: 'نامعلوم' })).toBeNull();
  });
});

describe('zone matching', () => {
  it('orders matches from city to province to catch-all', () => {
    const ids = matchZones(ZONES, {
      provinceCode: 'TEHRAN',
      city: 'تهران',
      postalCode: null,
    }).map((z) => z.id);
    expect(ids).toEqual(['tehran-city', 'tehran-province', 'rest']);
  });

  it('a Tehran-province town does not match the Tehran-city zone', () => {
    const ids = matchZones(ZONES, {
      provinceCode: 'TEHRAN',
      city: 'ورامین',
      postalCode: null,
    }).map((z) => z.id);
    expect(ids).toEqual(['tehran-province', 'rest']);
  });

  it('other provinces fall back to the catch-all zone', () => {
    const ids = matchZones(ZONES, {
      provinceCode: 'FARS',
      city: 'شیراز',
      postalCode: null,
    }).map((z) => z.id);
    expect(ids).toEqual(['rest']);
  });
});

describe('rate fee', () => {
  const r = rate('post', 'rest', { baseRial: 700_000, stepRial: 250_000 });

  it('charges base up to the base weight', () => {
    expect(computeRateFee(r, { weightGrams: 1000, valueRial: 0 })).toBe(
      700_000,
    );
  });

  it('charges each started extra step', () => {
    expect(computeRateFee(r, { weightGrams: 1001, valueRial: 0 })).toBe(
      950_000,
    );
    expect(computeRateFee(r, { weightGrams: 3000, valueRial: 0 })).toBe(
      1_200_000,
    );
  });

  it('adds the value percent, clamps to min/max and rounds up', () => {
    const insured = {
      ...r,
      valuePercent: 0.5,
      minRial: 1_000_000,
      maxRial: 3_000_000,
    };
    // 700,000 + 0.5% × 100,000,000 = 1,200,000
    expect(
      computeRateFee(insured, { weightGrams: 500, valueRial: 100_000_000 }),
    ).toBe(1_200_000);
    expect(computeRateFee(insured, { weightGrams: 500, valueRial: 0 })).toBe(
      1_000_000,
    );
    expect(
      computeRateFee(insured, { weightGrams: 500, valueRial: 10_000_000_000 }),
    ).toBe(3_000_000);
    expect(
      computeRateFee(
        { ...r, baseRial: 701_234 },
        { weightGrams: 10, valueRial: 0 },
        10_000,
      ),
    ).toBe(710_000);
  });
});

describe('quoteShippingOptions', () => {
  const quote = (
    dest: { provinceCode: string; city: string; postalCode?: string },
    valueRial = 50_000_000,
    rates = RATES,
  ) =>
    quoteShippingOptions({
      destination: { postalCode: '1234567890', ...dest },
      parcel: { weightGrams: 300, valueRial },
      zones: ZONES,
      rates,
      methods: METHODS,
    });

  it('Tehran city: courier, Tehran-province post tariff and pickup', () => {
    const opts = quote({ provinceCode: 'TEHRAN', city: 'تهران' });
    expect(opts.map((o) => [o.code, o.zoneId, o.feeRial])).toEqual([
      ['COURIER', 'tehran-city', 1_500_000],
      ['POST', 'tehran-province', 400_000],
      ['PICKUP', 'rest', 0],
    ]);
  });

  it('Shiraz: no courier, post priced with the rest-of-country tariff', () => {
    const opts = quote({ provinceCode: 'FARS', city: 'شیراز' });
    expect(opts.map((o) => o.code)).toEqual(['POST', 'PICKUP']);
    expect(opts[0].feeRial).toBe(700_000);
  });

  it('an inactive rate in a more specific zone hides the method instead of falling back', () => {
    const rates = [...RATES, rate('post', 'tehran-city', { isActive: false })];
    expect(
      quote({ provinceCode: 'TEHRAN', city: 'تهران' }, 1, rates).map(
        (o) => o.code,
      ),
    ).toEqual(['COURIER', 'PICKUP']);
    expect(
      quote({ provinceCode: 'TEHRAN', city: 'ورامین' }, 1, rates).map(
        (o) => o.code,
      ),
    ).toEqual(['POST', 'PICKUP']);
  });

  it('marks options unavailable for missing postal code and caps', () => {
    const noPostal = quote({
      provinceCode: 'FARS',
      city: 'شیراز',
      postalCode: '',
    });
    expect(noPostal[0].available).toBe(false);
    expect(noPostal[0].unavailableReason).toContain('کد پستی');

    const capped = quote({ provinceCode: 'FARS', city: 'شیراز' }, 50_000_000, [
      rate('post', 'rest', { maxOrderRial: 10_000_000 }),
    ]);
    expect(capped[0].available).toBe(false);
  });

  it('flags free shipping above the threshold', () => {
    const rates = [rate('post', 'rest', { freeAboveRial: 40_000_000 })];
    expect(
      quote({ provinceCode: 'FARS', city: 'شیراز' }, 50_000_000, rates)[0].free,
    ).toBe(true);
    expect(
      quote({ provinceCode: 'FARS', city: 'شیراز' }, 30_000_000, rates)[0].free,
    ).toBe(false);
  });
});

describe('resolveShippingCharge', () => {
  it('prepaid charges the full fee', () => {
    expect(
      resolveShippingCharge(
        { feeRial: 700_000, free: false, feePayment: 'PREPAID' },
        true,
      ),
    ).toEqual({
      shippingRial: 700_000,
      waivedRial: 0,
      payOnDelivery: false,
      estimateRial: 700_000,
    });
  });

  it('pay on delivery charges zero and keeps the estimate', () => {
    expect(
      resolveShippingCharge({
        feeRial: 700_000,
        free: false,
        feePayment: 'ON_DELIVERY',
      }),
    ).toEqual({
      shippingRial: 0,
      waivedRial: 0,
      payOnDelivery: true,
      estimateRial: 700_000,
    });
  });

  it('customer choice follows the customer', () => {
    const opt = {
      feeRial: 700_000,
      free: false,
      feePayment: 'CUSTOMER_CHOICE' as const,
    };
    expect(resolveShippingCharge(opt, false).shippingRial).toBe(700_000);
    expect(resolveShippingCharge(opt, true)).toMatchObject({
      shippingRial: 0,
      payOnDelivery: true,
    });
  });

  it('free shipping waives the fee regardless of payment mode', () => {
    expect(
      resolveShippingCharge({
        feeRial: 700_000,
        free: true,
        feePayment: 'ON_DELIVERY',
      }),
    ).toEqual({
      shippingRial: 0,
      waivedRial: 700_000,
      payOnDelivery: false,
      estimateRial: 700_000,
    });
  });
});
