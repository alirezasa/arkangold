// api/src/fees/user-fee-override.ts
//
// کارمزد خرید/فروش طلای هر کاربر:
// - هنگام ثبت‌نام، نرخ فعلی تنظیمات سیستم (fee.buy_gold / fee.sell_gold) در fee_configs کاربر
//   ذخیره می‌شود (signupFeeRows)؛ تغییر بعدی تنظیمات روی کاربران قبلی اثری ندارد.
// - کارشناس از صفحه‌ی کاربر همین نرخ را کم یا زیاد می‌کند؛ معامله با آخرین ردیف فعال انجام می‌شود.
// - اگر کاربری ردیف نداشته باشد، نرخ فعلی تنظیمات سیستم ملاک است.
// کارمزد برداشت و واریز برای همه یکسان است و فقط از تنظیمات سیستم خوانده می‌شود.
import type { SystemConfigService } from '../system-config/system-config.service';

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

/** آخرین کارمزد ثبت‌شده برای کاربر (null = بدون ردیف → نرخ تنظیمات سیستم) */
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

/**
 * ردیف‌های کارمزد کاربر جدید با نرخ همین لحظه‌ی تنظیمات سیستم؛ فراخواننده userId را اضافه می‌کند
 * (createMany هنگام ثبت‌نام)
 */
export async function signupFeeRows(
  systemConfig: Pick<SystemConfigService, 'getDecimal'>,
) {
  const [buy, sell] = await Promise.all(
    USER_FEE_TYPES.map((t) =>
      systemConfig.getDecimal(SYSTEM_FEE_KEY[t], '1.0'),
    ),
  );
  return [
    { type: 'BUY_GOLD' as const, feePercent: buy.toString() },
    { type: 'SELL_GOLD' as const, feePercent: sell.toString() },
  ];
}
