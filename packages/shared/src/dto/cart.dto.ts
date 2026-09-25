import { IsUUID, IsInt, IsOptional, IsNumber, Min } from "class-validator";

export class AddCartItemDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  weightGrams?: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  // طرح بسته‌بندی انتخابی کاربر — اگر محصول بسته‌بندی دارد و ارسال نشود،
  // گزینه پیش‌فرض محصول در نظر گرفته می‌شود
  @IsOptional()
  @IsUUID()
  packagingOptionId?: string;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  weightGrams?: number;

  // تغییر بسته‌بندی آیتم از داخل سبد خرید
  @IsOptional()
  @IsUUID()
  packagingOptionId?: string;
}
