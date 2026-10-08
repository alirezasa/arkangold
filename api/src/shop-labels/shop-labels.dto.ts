// api/src/shop-labels/shop-labels.dto.ts
import {
  ArrayMaxSize,
  ArrayMinSize,
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

export const LABEL_DPI_OPTIONS = [152, 203, 300, 600] as const;
export const LABEL_REPEAT_OPTIONS = ['ORDER', 'ITEM', 'UNIT'] as const;
export type LabelRepeatOption = (typeof LABEL_REPEAT_OPTIONS)[number];

export class CreateLabelSizeDto {
  @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsNumber() @Min(10) @Max(300) widthMm!: number;
  @IsNumber() @Min(10) @Max(400) heightMm!: number;
  @IsOptional() @IsIn(LABEL_DPI_OPTIONS) dpi?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

export class UpdateLabelSizeDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsNumber() @Min(10) @Max(300) widthMm?: number;
  @IsOptional() @IsNumber() @Min(10) @Max(400) heightMm?: number;
  @IsOptional() @IsIn(LABEL_DPI_OPTIONS) dpi?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

export class CreateLabelTemplateDto {
  @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsIn(LABEL_REPEAT_OPTIONS) repeat!: LabelRepeatOption;
  @IsUUID() sizeId!: string;
  /** ساختار عناصر در سرویس با sanitizeElements بررسی می‌شود */
  @IsArray() @ArrayMaxSize(60) elements!: unknown[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

export class UpdateLabelTemplateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsOptional() @IsIn(LABEL_REPEAT_OPTIONS) repeat?: LabelRepeatOption;
  @IsOptional() @IsUUID() sizeId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(60) elements?: unknown[];
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(999) sortOrder?: number;
}

export class LabelSettingsDto {
  @IsOptional() @IsString() @MaxLength(80) senderName?: string;
  @IsOptional() @IsString() @MaxLength(40) senderPhone?: string;
  @IsOptional() @IsString() @MaxLength(300) senderAddress?: string;
  @IsOptional() @IsString() @MaxLength(20) senderPostalCode?: string;
  @IsOptional()
  @IsString()
  @Matches(/^\d{2,9}$/, { message: 'پیشوند بارکد باید ۲ تا ۹ رقم باشد' })
  eanPrefix?: string;
  @IsOptional() @IsBoolean() autoAssignBarcode?: boolean;
}

export class SetBarcodeDto {
  @IsIn(['PRODUCT', 'VARIANT']) target!: 'PRODUCT' | 'VARIANT';
  @IsUUID() id!: string;
  /** خالی یا null = حذف بارکد */
  @IsOptional() @IsString() @MaxLength(20) barcode?: string | null;
}

export class GenerateBarcodesDto {
  /** فقط برای این محصولات؛ خالی = همه‌ی کالاهای بدون بارکد */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  productIds?: string[];
}

export class BarcodeListQueryDto {
  @IsOptional() @IsString() @MaxLength(60) q?: string;
  @IsOptional() @IsIn(['true', 'false']) missing?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

export class LabelOrdersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  orderIds!: string[];
}
