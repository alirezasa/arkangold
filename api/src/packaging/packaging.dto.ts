// api/src/packaging/packaging.dto.ts
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const MAX_RIAL = 100_000_000_000;

/**
 * همه مبالغ به ریال (پنل ادمین ورودی تومان را ×۱۰ ارسال می‌کند).
 * freeThresholdRial = null یعنی «آستانه عمومی تنظیمات فروشگاه».
 */
export class CreatePackagingOptionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{2,30}$/, {
    message: 'کد بسته‌بندی فقط حروف انگلیسی، عدد و خط تیره (۲ تا ۳۰ کاراکتر)',
  })
  code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  priceRial!: number;

  @IsOptional()
  @IsBoolean()
  perUnit?: boolean;

  @IsOptional()
  @IsBoolean()
  freeEligible?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(10)
  @Max(MAX_RIAL)
  freeThresholdRial?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdatePackagingOptionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{2,30}$/, {
    message: 'کد بسته‌بندی فقط حروف انگلیسی، عدد و خط تیره (۲ تا ۳۰ کاراکتر)',
  })
  code?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  priceRial?: number;

  @IsOptional()
  @IsBoolean()
  perUnit?: boolean;

  @IsOptional()
  @IsBoolean()
  freeEligible?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(10)
  @Max(MAX_RIAL)
  freeThresholdRial?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  sortOrder?: number;
}

export class UpdatePackagingSettingsDto {
  /** آستانه عمومی رایگان شدن بسته‌بندی (ریال) — ۰ = غیرفعال */
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(MAX_RIAL)
  freeThresholdRial!: number;
}

export class ProductPackagingLinkDto {
  @IsUUID()
  packagingOptionId!: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class SetProductPackagingDto {
  /** فهرست کامل طرح‌های این محصول (جایگزین فهرست قبلی)؛ خالی = بدون بسته‌بندی */
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => ProductPackagingLinkDto)
  options!: ProductPackagingLinkDto[];
}
