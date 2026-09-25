import { PackagingService, ResolvedPackaging } from './packaging.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { SystemConfigService } from '../system-config/system-config.service';

const option = (over: Partial<ResolvedPackaging> = {}): ResolvedPackaging => ({
  id: 'box',
  name: 'جعبه چوبی',
  code: null,
  description: null,
  imageUrl: null,
  priceRial: 500_000,
  perUnit: true,
  freeEligible: true,
  freeThresholdRial: null,
  isDefault: false,
  ...over,
});

describe('PackagingService (محاسبه بسته‌بندی)', () => {
  const service = new PackagingService(
    {} as PrismaService,
    {} as SystemConfigService,
  );

  it('قیمت per-unit در تعداد ضرب می‌شود و per-line فقط یک‌بار', () => {
    const summary = service.computeCharges(
      [
        { key: 'a', option: option(), quantity: 3 },
        {
          key: 'b',
          option: option({ id: 'bag', perUnit: false }),
          quantity: 4,
        },
        { key: 'c', option: null, quantity: 2 },
      ],
      10_000_000,
      0,
    );
    expect(summary.lines.get('a')?.chargedRial).toBe(1_500_000);
    expect(summary.lines.get('b')?.packagingQuantity).toBe(1);
    expect(summary.lines.get('b')?.chargedRial).toBe(500_000);
    expect(summary.lines.has('c')).toBe(false);
    expect(summary.chargedRial).toBe(2_000_000);
    expect(summary.waivedRial).toBe(0);
    expect(summary.nextFreeThresholdRial).toBeNull();
  });

  it('با رسیدن جمع اقلام به آستانه عمومی، بسته‌بندی مشمول رایگان می‌شود', () => {
    const inputs = [
      { key: 'a', option: option(), quantity: 2 },
      {
        key: 'b',
        option: option({ id: 'lux', freeEligible: false }),
        quantity: 1,
      },
    ];

    const below = service.computeCharges(inputs, 49_999_990, 50_000_000);
    expect(below.lines.get('a')?.free).toBe(false);
    expect(below.nextFreeThresholdRial).toBe(50_000_000);

    const reached = service.computeCharges(inputs, 50_000_000, 50_000_000);
    expect(reached.lines.get('a')?.free).toBe(true);
    expect(reached.lines.get('a')?.chargedRial).toBe(0);
    // طرح غیرمشمول همچنان پولی است
    expect(reached.lines.get('b')?.chargedRial).toBe(500_000);
    expect(reached.waivedRial).toBe(1_000_000);
    expect(reached.chargedRial).toBe(500_000);
    expect(reached.nextFreeThresholdRial).toBeNull();
  });

  it('آستانه اختصاصی طرح بر آستانه عمومی مقدم است', () => {
    const custom = option({ freeThresholdRial: 20_000_000 });
    expect(service.effectiveThreshold(custom, 50_000_000)).toBe(20_000_000);
    expect(service.effectiveThreshold(option(), 50_000_000)).toBe(50_000_000);
    expect(service.effectiveThreshold(option(), 0)).toBeNull();

    const summary = service.computeCharges(
      [{ key: 'a', option: custom, quantity: 1 }],
      25_000_000,
      50_000_000,
    );
    expect(summary.lines.get('a')?.free).toBe(true);
  });

  it('انتخاب نامعتبر به گزینه پیش‌فرض محصول برمی‌گردد', () => {
    const options = [option({ id: 'x' }), option({ id: 'y', isDefault: true })];
    expect(service.pick(options, 'x')?.id).toBe('x');
    expect(service.pick(options, 'gone')?.id).toBe('y');
    expect(service.pick(options, null)?.id).toBe('y');
    expect(service.pick([option({ id: 'z' })], null)?.id).toBe('z');
    expect(service.pick([], 'x')).toBeNull();
  });
});
