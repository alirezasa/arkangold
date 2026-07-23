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
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  weightGrams?: number;
}
