// api/src/discount/discount.dto.ts
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export const DISCOUNT_TYPES = ['PERCENT', 'FIXED'] as const;
export type DiscountTypeValue = (typeof DISCOUNT_TYPES)[number];

export const DISCOUNT_STATUS_FILTERS = [
  'ACTIVE',
  'INACTIVE',
  'EXPIRED',
  'SCHEDULED',
] as const;
export type DiscountStatusFilter = (typeof DISCOUNT_STATUS_FILTERS)[number];

/**
 * همه مبالغ به ریال. برای نوع PERCENT مقدار value درصد است (۰ تا ۱۰۰)،
 * برای FIXED مبلغ ثابت تخفیف به ریال.
 * مقدار null در فیلدهای اختیاری یعنی «بدون محدودیت».
 */
export class CreateDiscountCodeDto {
  /** خالی = تولید خودکار با فرمت حروف بزرگ-عدد (مثلاً ARKAN-482915) */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  /** پیشوند حروفی برای تولید خودکار (فقط حروف انگلیسی) */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2,10}$/, {
    message: 'پیشوند کد باید ۲ تا ۱۰ حرف انگلیسی باشد',
  })
  codePrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsIn(DISCOUNT_TYPES)
  type!: DiscountTypeValue;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000_000)
  value!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  maxDiscountRial?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  minOrderRial?: number | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number | null;

  /** null/خالی = قابل استفاده برای همه کاربران */
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** برای کد اختصاصی: ارسال پیامک اطلاع‌رسانی به کاربر */
  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean;
}

export class UpdateDiscountCodeDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @IsOptional()
  @IsIn(DISCOUNT_TYPES)
  type?: DiscountTypeValue;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000_000)
  value?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  maxDiscountRial?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  minOrderRial?: number | null;

  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  perUserLimit?: number | null;

  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AdminListDiscountCodesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsString() @MaxLength(40) search?: string;
  @IsOptional() @IsIn(DISCOUNT_STATUS_FILTERS) status?: DiscountStatusFilter;
}

export class AdminDiscountUsagesQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class GenerateDiscountCodeQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2,10}$/, {
    message: 'پیشوند کد باید ۲ تا ۱۰ حرف انگلیسی باشد',
  })
  prefix?: string;
}
