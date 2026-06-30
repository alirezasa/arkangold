import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class GetPriceHistoryQueryDto {
  @Transform(({ value }) => Number(value ?? 24))
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  hours = 24;
}
