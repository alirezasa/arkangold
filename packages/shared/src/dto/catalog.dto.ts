import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsInt,
  Length,
  IsIn,
  IsBoolean,
  Matches,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";
import { ProductStatus, ProductPricingMode } from "../enums";
import { GoldPurityKarat } from './product-pricing.dto';

// اسلاگ: حروف کوچک انگلیسی، ارقام، حروف فارسی و خط تیره (بدون فاصله/خط تیره ابتدا و انتها)
export const CATEGORY_SLUG_PATTERN = /^[a-z0-9\u0600-\u06FF]+(?:-[a-z0-9\u0600-\u06FF]+)*$/;
const CATEGORY_SLUG_MESSAGE =
  "اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، ارقام، حروف فارسی و خط تیره (-) باشد";

export class CreateCategoryDto {
  @IsString()
  @Length(2, 100)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Matches(CATEGORY_SLUG_PATTERN, { message: CATEGORY_SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @Length(2, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(2, 100)
  @Matches(CATEGORY_SLUG_PATTERN, { message: CATEGORY_SLUG_MESSAGE })
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  // null = حذف دسته والد (انتقال به سطح اول)
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// یک ردیف از مشخصات فنی محصول (مثلاً «ابعاد: ۲۰×۳۰ میلی‌متر»)
export class ProductSpecificationDto {
  @IsString()
  @Length(1, 60)
  label!: string;

  @IsString()
  @Length(1, 300)
  value!: string;
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
   @IsOptional()
  @IsString()
  shortDescription?: string;

  @IsOptional()
  @IsString()
  metaKeywords?: string;

  @IsOptional()
  @IsIn(Object.values(GoldPurityKarat))
  purityKarat?: GoldPurityKarat;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationDto)
  specifications?: ProductSpecificationDto[];
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
  @IsOptional() @IsString() shortDescription?: string;
  @IsOptional() @IsString() metaKeywords?: string;
  @IsOptional() @IsIn(Object.values(GoldPurityKarat)) purityKarat?: GoldPurityKarat;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProductSpecificationDto)
  specifications?: ProductSpecificationDto[];
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
  
  // ⬅️ جدید: برای فیلتر بر اساس slug دسته (مثلاً "gold-ingot")
  // وقتی این پر باشد، categoryId نادیده گرفته می‌شود
  @IsOptional()
  @IsString()
  categorySlug?: string;

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