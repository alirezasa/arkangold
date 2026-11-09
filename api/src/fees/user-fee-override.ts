// api/src/fees/user-fee-override.ts
//
// کارمزد اختصاصی کاربر: ردیف فعال fee_configs با user_id همان کاربر، نرخ پیش‌فرض سیستم
// (system_config: fee.buy_gold / fee.sell_gold / withdrawal.fee_*) را برای او جایگزین می‌کند.
// - ردیف‌هایی که پیش‌تر هنگام ثبت‌نام به‌صورت خودکار ساخته می‌شدند در migration
//   20261109090000_user_fee_overrides غیرفعال شده‌اند؛ فقط کارشناس از پنل ردیف فعال می‌سازد.
// - نبود ردیف فعال یعنی «همان نرخ پیش‌فرض سیستم».

export const USER_FEE_TYPES = ['BUY_GOLD', 'SELL_GOLD', 'WITHDRAWAL'] as const;
export type UserFeeType = (typeof USER_FEE_TYPES)[number];

/** مقادیر Decimal پریزما (فقط toString لازم است تا وابستگی نوعی به کلاینت تولیدشده نباشد) */
interface DecimalLike {
  toString(): string;
}

export interface UserFeeOverride {
  feePercent: DecimalLike;
  feeFixedRial: DecimalLike | null;
}

type FeeConfigReader = {
  feeConfig: {
    findFirst(args: {
      where: { userId: string; type: UserFeeType; isActive: boolean };
      orderBy: { updatedAt: 'desc' };
      select: { feePercent: true; feeFixedRial: true };
    }): Promise<UserFeeOverride | null>;
  };
};

export function findUserFeeOverride(
  prisma: FeeConfigReader,
  userId: string,
  type: UserFeeType,
): Promise<UserFeeOverride | null> {
  return prisma.feeConfig.findFirst({
    where: { userId, type, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: { feePercent: true, feeFixedRial: true },
  });
}
