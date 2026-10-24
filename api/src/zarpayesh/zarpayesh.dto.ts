// api/src/zarpayesh/zarpayesh.dto.ts
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;
const LONG = /^\d{1,19}$/;

export class UpdateZarPayeshSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/[^\s/]+(:\d+)?$/, {
    message:
      'آدرس سرور باید فقط شامل پروتکل و دامنه باشد (مثلاً http://api.rpmms.ir)',
  })
  baseUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3000)
  @Max(60000)
  timeoutMs?: number;

  @IsOptional()
  @IsString()
  @Matches(LONG)
  typeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  typeTitle?: string;

  @IsOptional()
  @IsString()
  @Matches(LONG)
  vaultId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  vaultTitle?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  buyPayType?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  sellPayType?: number;

  @IsOptional()
  @IsIn(['GRAM', 'MILLIGRAM'])
  unitPriceBasis?: 'GRAM' | 'MILLIGRAM';

  @IsOptional()
  @IsBoolean()
  autoRegisterUsers?: boolean;
}

export class SetZarPayeshCredentialDto {
  @IsIn(['ACCOUNT', 'PASSWORD', 'AES_KEY'])
  key!: 'ACCOUNT' | 'PASSWORD' | 'AES_KEY';

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  value!: string;
}

export class ToggleZarPayeshDto {
  @IsBoolean()
  enabled!: boolean;
}

export class CryptoTestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  value!: string;
}

export class TestReserveDto {
  @IsUUID()
  userId!: string;

  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @IsString()
  @Matches(POSITIVE_DECIMAL)
  amountGrams!: string;

  @IsString()
  @Matches(/^\d+$/)
  pricePerGramRial!: string;
}

export class ApproveTradeDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  rrn?: string;
}

export class ReviewTradeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  note!: string;
}

export class EditPlatformUserDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  fkCity?: number;
}

export class CreateDeliveryDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL)
  amountGrams!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;
}

export class SetDeliveryStatusDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  status!: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{0,19}$/)
  approveCode?: string;
}

export class ListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  success?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  needsReview?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
