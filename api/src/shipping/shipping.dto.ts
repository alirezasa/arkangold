// api/src/shipping/shipping.dto.ts
//
// همه مبالغ به ریال (پنل ادمین ورودی تومان را ×۱۰ ارسال می‌کند)؛ وزن‌ها به گرم.
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const MAX_RIAL = 100_000_000_000_000;
const MAX_GRAMS = 1_000_000;
export const FEE_PAYMENTS = [
  'PREPAID',
  'ON_DELIVERY',
  'CUSTOMER_CHOICE',
] as const;

export class ShippingCarrierDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{2,30}$/, {
    message: 'کد فقط شامل حروف انگلیسی، عدد، خط تیره و زیرخط (۲ تا ۳۰ کاراکتر)',
  })
  code?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @IsString() @MaxLength(200) website?: string | null;
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string | null;
  @IsOptional() @IsString() @MaxLength(300) trackingUrlTemplate?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class ShippingZoneDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(31)
  @IsString({ each: true })
  provinceCodes?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  cities?: string[];

  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}

export class ShippingRateDto {
  @IsOptional() @IsUUID() methodId?: string;
  @IsOptional() @IsUUID() zoneId?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  baseRial?: number;
  @IsOptional() @IsInt() @Min(0) @Max(MAX_GRAMS) baseWeightGrams?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  stepRial?: number;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_GRAMS) stepWeightGrams?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  valuePercent?: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  minRial?: number | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  maxRial?: number | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  freeAboveRial?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_GRAMS) maxWeightGrams?: number | null;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  maxOrderRial?: number | null;
  @IsOptional() @IsIn(FEE_PAYMENTS) feePayment?: (typeof FEE_PAYMENTS)[number];
  @IsOptional() @IsInt() @Min(0) @Max(90) etaMinDays?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(90) etaMaxDays?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ShippingSimulateDto {
  @IsString() @MaxLength(40) provinceCode!: string;
  @IsOptional() @IsString() @MaxLength(60) city?: string;
  @IsOptional() @IsString() @MaxLength(10) postalCode?: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(MAX_GRAMS) weightGrams!: number;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  valueRial!: number;
}

export class ShippingOptionsQueryDto {
  @IsUUID() addressId!: string;
}
