import { Prisma } from '../generated/prisma/client';
import { planGoldBarPayment } from './gold-bar-delivery.service';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

describe('planGoldBarPayment — تحویل فیزیکی: خرید شمش با طلای آب‌شده', () => {
  // شمش ۱ گرمی ۱۰۰٬۰۰۰٬۰۰۰ ریال؛ نرخ طلای آب‌شده ۸۰٬۰۰۰٬۰۰۰ ریال/گرم
  const base = {
    priceRial: D(100_000_000),
    weightGrams: D(1),
    goldRateRial: D(80_000_000),
  };

  it('طلای کافی + طلای اضافه: کل مابه‌التفاوت با طلا، بدون ریال و درگاه', () => {
    const p = planGoldBarPayment({
      ...base,
      goldAvailableGrams: D(2),
      rialAvailable: D(0),
      useExtraGold: true,
      useRialWallet: true,
    });
    expect(p.goldForBarGrams.toString()).toBe('1');
    expect(p.goldForBarRial.toString()).toBe('80000000');
    expect(p.differenceRial.toString()).toBe('20000000');
    expect(p.extraGoldGrams.toString()).toBe('0.25');
    expect(p.extraGoldRial.toString()).toBe('20000000');
    expect(p.rialWalletRial.toString()).toBe('0');
    expect(p.gatewayRial.toString()).toBe('0');
    expect(p.goldAppliedGrams.toString()).toBe('1.25');
    expect(p.goldAppliedRial.toString()).toBe('100000000');
  });

  it('فقط وزن شمش از طلا؛ مابه‌التفاوت از کیف ریالی و باقی از درگاه (ترکیبی)', () => {
    const p = planGoldBarPayment({
      ...base,
      goldAvailableGrams: D(1.5),
      rialAvailable: D(5_000_000),
      useExtraGold: false,
      useRialWallet: true,
    });
    expect(p.goldAppliedGrams.toString()).toBe('1');
    expect(p.rialWalletRial.toString()).toBe('5000000');
    expect(p.gatewayRial.toString()).toBe('15000000');
  });

  it('کسری طلا (۵۰۰ سوت برای شمش ۱ گرمی): کسری محاسبه و از درگاه پرداخت می‌شود', () => {
    const p = planGoldBarPayment({
      ...base,
      goldAvailableGrams: D(0.5),
      rialAvailable: D(0),
      useExtraGold: true,
      useRialWallet: true,
    });
    expect(p.goldForBarGrams.toString()).toBe('0.5');
    expect(p.shortfallGrams.toString()).toBe('0.5');
    expect(p.goldForBarRial.toString()).toBe('40000000');
    expect(p.differenceRial.toString()).toBe('60000000');
    expect(p.extraGoldGrams.toString()).toBe('0');
    expect(p.gatewayRial.toString()).toBe('60000000');
  });

  it('طلای اضافه‌ی ناکافی: همه‌ی طلای اضافه مصرف و باقی به کیف ریالی/درگاه', () => {
    const p = planGoldBarPayment({
      ...base,
      goldAvailableGrams: D(1.1),
      rialAvailable: D(100_000_000),
      useExtraGold: true,
      useRialWallet: true,
    });
    expect(p.extraGoldGrams.toString()).toBe('0.1');
    expect(p.extraGoldRial.toString()).toBe('8000000');
    expect(p.rialWalletRial.toString()).toBe('12000000');
    expect(p.gatewayRial.toString()).toBe('0');
  });

  it('جمع اجزای پرداخت همیشه برابر قیمت شمش است', () => {
    const p = planGoldBarPayment({
      priceRial: D(123_456_789),
      weightGrams: D(0.5),
      goldRateRial: D(77_777_777),
      goldAvailableGrams: D(0.7321),
      rialAvailable: D(3_333_333),
      useExtraGold: true,
      useRialWallet: true,
    });
    const sum = p.goldAppliedRial.plus(p.rialWalletRial).plus(p.gatewayRial);
    expect(sum.toString()).toBe('123456789');
    expect(p.goldAppliedGrams.lessThanOrEqualTo(D(0.7321))).toBe(true);
  });
});
