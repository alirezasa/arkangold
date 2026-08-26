import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  IsBoolean,
  IsUUID,
  IsDateString,
  Min,
  Max,
  Length,
  ArrayNotEmpty,
} from "class-validator";

export class CreatePayrollPlanDto {
  @IsString()
  @Length(2, 150)
  name!: string;

  @IsNumber()
  @Min(0.0001)
  amountGrams!: number;

  @IsInt()
  @Min(1)
  @Max(28)
  executionDay!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  userIds?: string[];
}

export class UpdatePayrollPlanDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  amountGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  executionDay?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class AddPayrollPlanUsersDto {
  @ArrayNotEmpty()
  @IsUUID(undefined, { each: true })
  userIds!: string[];
}
