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
  IsIn,
  ValidateIf,
} from "class-validator";

export const PAYROLL_AMOUNT_TYPES = ["GRAMS", "RIAL"] as const;
export type PayrollAmountTypeValue = (typeof PAYROLL_AMOUNT_TYPES)[number];

export class CreatePayrollPlanDto {
  @IsString()
  @Length(2, 150)
  name!: string;

  /** GRAMS (پیش‌فرض): مقدار ثابت طلا — RIAL: مبلغ ریالی که هنگام اجرا به طلا تبدیل می‌شود */
  @IsOptional()
  @IsIn(PAYROLL_AMOUNT_TYPES)
  amountType?: PayrollAmountTypeValue;

  @ValidateIf((o: CreatePayrollPlanDto) => o.amountType !== "RIAL")
  @IsNumber()
  @Min(0.0001)
  amountGrams?: number;

  /** مبلغ ریالی هر پرداخت (فقط برای amountType = RIAL) */
  @ValidateIf((o: CreatePayrollPlanDto) => o.amountType === "RIAL")
  @IsInt()
  @Min(10000)
  amountRial?: number;

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
  @IsIn(PAYROLL_AMOUNT_TYPES)
  amountType?: PayrollAmountTypeValue;

  @IsOptional()
  @IsNumber()
  @Min(0.0001)
  amountGrams?: number;

  @IsOptional()
  @IsInt()
  @Min(10000)
  amountRial?: number;

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
