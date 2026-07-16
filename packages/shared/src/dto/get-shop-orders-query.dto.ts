import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsIn, Min, Max } from 'class-validator';
import { ShopOrderStatus } from '../enums';

export class GetShopOrdersQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @IsOptional()
  @IsIn(Object.values(ShopOrderStatus))
  status?: ShopOrderStatus;
}