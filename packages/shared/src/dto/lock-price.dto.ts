import { Transform } from "class-transformer";
import { IsEnum, IsNumber, IsPositive, Max } from "class-validator";
import { OrderSide } from "../enums";

export class LockPriceDto {
  @IsEnum(OrderSide)
  side!: OrderSide;

  @Transform(({ value }) => Number(value))
  @IsNumber()
  @IsPositive()
  @Max(1000000)
  amountGrams!: number;
}