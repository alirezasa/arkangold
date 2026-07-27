// packages/shared/src/dto/product-pricing.dto.ts
import { IsString, IsEnum, IsNumber, Min, IsInt, IsOptional, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export enum PricingComponentBase {
  GOLD_VALUE = 'GOLD_VALUE',
  RUNNING_TOTAL = 'RUNNING_TOTAL',
  FIXED = 'FIXED',
}

export enum PricingComponentValueType {
  PERCENT = 'PERCENT',
  FIXED_RIAL = 'FIXED_RIAL',
}

export enum GoldPurityKarat {
  K18 = 'K18',
  K24 = 'K24',
}

export class UpsertProductPricingComponentDto {
  @IsString()
  componentKey!: string;

  @IsEnum(PricingComponentBase)
  baseType!: PricingComponentBase;

  @IsEnum(PricingComponentValueType)
  valueType!: PricingComponentValueType;

  @IsNumber()
  value!: number;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class SetProductPricingDto {
  @IsOptional()
  @IsEnum(GoldPurityKarat)
  purityKarat?: GoldPurityKarat;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertProductPricingComponentDto)
  components!: UpsertProductPricingComponentDto[];
}