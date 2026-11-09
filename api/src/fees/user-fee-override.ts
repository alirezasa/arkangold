// api/src/fees/user-fee-override.ts
//
// کارمزد خرید/فروش طلای هر کاربر — در هر قفل قیمت (پیش‌فاکتور معامله) بررسی می‌شود:
// - کارمزد دستی: ردیف فعال fee_configs کاربر که فقط کارشناس از صفحه‌ی کاربر ثبت می‌کند. تغییر
//   تنظیمات سیستم روی این کاربر اثری ندارد تا کارشناس آن را تغییر دهد یا «بازگشت به تنظیمات» بزند.
// - بدون کارمزد دستی: نرخ همین لحظه‌ی تنظیمات سیستم (fee.buy_gold / fee.sell_gold)؛ پس هر تغییر
//   تنظیمات بلافاصله برای همه‌ی کاربران جدید و قدیم اعمال می‌شود.
// کارمزد برداشت و واریز برای همه یکسان است و فقط از تنظیمات سیستم خوانده می‌شود.

export const USER_FEE_TYPES = ['BUY_GOLD', 'SELL_GOLD'] as const;
export type UserFeeType = (typeof USER_FEE_TYPES)[number];

export const SYSTEM_FEE_KEY: Record<UserFeeType, string> = {
  BUY_GOLD: 'fee.buy_gold',
  SELL_GOLD: 'fee.sell_gold',
};

/** مقادیر Decimal پریزما (فقط toString لازم است تا وابستگی نوعی به کلاینت تولیدشده نباشد) */
interface DecimalLike {
  toString(): string;
}

export interface UserFeeRow {
  feePercent: DecimalLike;
  updatedAt: Date;
}

type FeeConfigReader = {
  feeConfig: {
    findFirst(args: {
      where: { userId: string; type: UserFeeType; isActive: boolean };
      orderBy: { updatedAt: 'desc' };
      select: { feePercent: true; updatedAt: true };
    }): Promise<UserFeeRow | null>;
  };
};

/** کارمزد دستی کاربر (آخرین تغییر کارشناس)؛ null = تابع تنظیمات سیستم */
export function findUserFee(
  prisma: FeeConfigReader,
  userId: string,
  type: UserFeeType,
): Promise<UserFeeRow | null> {
  return prisma.feeConfig.findFirst({
    where: { userId, type, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { feePercent: true, updatedAt: true },
  });
}
