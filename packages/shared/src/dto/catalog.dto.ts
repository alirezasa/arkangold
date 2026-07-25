import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsInt,
  Length,
  IsIn,
} from "class-validator";
import { Transform } from "class-transformer";
import { ProductStatus, ProductPricingMode } from "../enums";

export class CreateCategoryDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @Length(2, 150)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  basePriceRial!: number;

  @IsOptional()
  @IsIn(Object.values(ProductPricingMode))
  pricingMode?: ProductPricingMode;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  minWeightGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  maxWeightGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  weightStepGrams?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerGramRial?: number;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDesc?: string;
}

export class UpdateProductDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @Length(2, 150) name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsNumber() @Min(0) basePriceRial?: number;
  @IsOptional()
  @IsIn(Object.values(ProductPricingMode))
  pricingMode?: ProductPricingMode;
  @IsOptional() @IsNumber() @Min(0.01) minWeightGrams?: number;
  @IsOptional() @IsNumber() @Min(0.01) maxWeightGrams?: number;
  @IsOptional() @IsNumber() @Min(0.01) weightStepGrams?: number;
  @IsOptional() @IsNumber() @Min(0) pricePerGramRial?: number;
  @IsOptional() @IsIn(Object.values(ProductStatus)) status?: ProductStatus;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDesc?: string;
}

export class CreateProductVariantDto {
  @IsNumber()
  @Min(0.01)
  weightGrams!: number;

  @IsOptional()
  @IsNumber()
  priceAdjustment?: number;

  @IsInt()
  @Min(0)
  stockQuantity!: number;

  @IsOptional()
  @IsString()
  sku?: string;
}

export class UpdateProductVariantDto {
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  weightGrams?: number;

  @IsOptional()
  @IsNumber()
  priceAdjustment?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsString()
  sku?: string;
}

export class GetProductsQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  limit = 20;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsIn(Object.values(ProductStatus))
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @Transform(({ value }) => value === "true" || value === true)
  inStock?: boolean;
}