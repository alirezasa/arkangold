// api/src/accounting/accounting.dto.ts
//
// DTOهای حسابداری پیشرفته. مبالغ ریالی، وزن‌ها به گرم.
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1'
    ? true
    : value === false || value === 'false' || value === '0'
      ? false
      : undefined;

export class PeriodQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class TrialBalanceQueryDto extends PeriodQueryDto {
  @IsOptional() @Transform(toBool) @IsBoolean() hideZero?: boolean;
}

export class StatementQueryDto extends PeriodQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @Transform(toBool) @IsBoolean() includeChildren?: boolean;
}

export class ListJournalQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional()
  @IsIn([
    'SYSTEM',
    'MANUAL',
    'OPENING',
    'CLOSING',
    'REVALUATION',
    'REVERSAL',
    'TREASURY',
    'PARTNER',
    'INVENTORY',
  ])
  source?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) referenceNumber?: number;
  @IsOptional() @Matches(/^\d{4,10}$/) accountCode?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() withLines?: boolean;
}

export class AsOfQueryDto {
  @IsOptional() @IsDateString() asOf?: string;
}

export class CreateAccountDto {
  @Matches(/^\d{4,10}$/, { message: 'کد حساب باید ۴ تا ۱۰ رقم باشد' })
  code!: string;
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsIn(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'])
  type!: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE';
  @IsOptional() @Matches(/^\d{4,10}$/) parentCode?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() allowManualEntry?: boolean;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() allowManualEntry?: boolean;
}

export class VoucherLineDto {
  @Matches(/^\d{4,10}$/) accountCode!: string;
  @IsIn(['DEBIT', 'CREDIT']) side!: 'DEBIT' | 'CREDIT';
  @IsOptional() @IsNumberString() amountRial?: string;
  @IsOptional() @IsNumberString() amountGrams?: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

export class VoucherDto {
  @IsOptional()
  @IsIn(['GENERAL', 'OPENING', 'EXPENSE', 'ADJUSTMENT'])
  type?: 'GENERAL' | 'OPENING' | 'EXPENSE' | 'ADJUSTMENT';
  @IsDateString() entryDate!: string;
  @IsString() @MinLength(3) @MaxLength(500) description!: string;
  @IsOptional() @IsString() @MaxLength(200) attachmentRef?: string;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => VoucherLineDto)
  lines!: VoucherLineDto[];
}

export class ListVouchersQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional()
  @IsIn(['DRAFT', 'POSTED', 'REJECTED', 'CANCELLED', 'REVERSED'])
  status?: string;
  @IsOptional()
  @IsIn(['GENERAL', 'OPENING', 'EXPENSE', 'ADJUSTMENT'])
  type?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

export class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class FiscalYearDto {
  @IsString() @MinLength(2) @MaxLength(60) title!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
}

export class LockDateDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string | null;
}

export class FinalizeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/) upTo!: string;
}

export class RevaluationDto {
  /** قیمت هر گرم ۷۵۰ (ریال) — خالی = قیمت لحظه‌ای بازار */
  @IsOptional() @IsNumberString() pricePerGramRial?: string;
}
