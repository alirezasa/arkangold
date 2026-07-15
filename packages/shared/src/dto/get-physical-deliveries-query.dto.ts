import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsIn, Min, Max } from "class-validator";
import { PhysicalDeliveryStatus } from "../enums";

export class GetPhysicalDeliveriesQueryDto {
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
  @IsIn(Object.values(PhysicalDeliveryStatus))
  status?: PhysicalDeliveryStatus;
}
