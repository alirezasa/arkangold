// api/src/buyback/buyback.dto.ts
import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsDateString,
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
  ValidateNested,
} from 'class-validator';
import { PAYOUT_METHODS } from '../wallet/wallet-admin.service';

export const BUYBACK_STATUSES = [
  'SUBMITTED',
  'AWAITING_DELIVERY',
  'RECEIVED',
  'INSPECTION_PASSED',
  'OFFERED',
  'ACCEPTED',
  'APPROVED',
  'PAID',
  'RETURN_PENDING',
  'RETURNED',
  'REJECTED',
  'CANCELLED',
] as const;
export type BuybackStatusKey = (typeof BUYBACK_STATUSES)[number];

// ═══════════════════════════ کاربر ═══════════════════════════

export class CreateBuybackDto {
  @IsUUID('4')
  hologramCodeId!: string;

  @IsIn(['IN_PERSON', 'INSURED_POST'])
  deliveryMethod!: 'IN_PERSON' | 'INSURED_POST';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** پذیرش شرایط بازخرید (اصالت‌سنجی حضوری، قیمت نهایی پس از کارشناسی، واریز به حساب پیش‌فرض) */
  @IsBoolean()
  @Equals(true, { message: 'پذیرش شرایط بازخرید الزامی است' })
  acceptTerms!: boolean;
}

export class CancelBuybackDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class RespondOfferDto {
  @IsBoolean()
  accept!: boolean;
}

// ═══════════════════════════ ادمین ═══════════════════════════

export class ListBuybackQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsIn([...BUYBACK_STATUSES, 'OPEN', 'ACTION'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;
}

export class AcceptBuybackDto {
  /** زمان نوبت تحویل شمش (اختیاری) */
  @IsOptional()
  @IsDateString()
  appointmentAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  appointmentNote?: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class NoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InspectionChecklistDto {
  /** هولوگرام سالم و بدون دستکاری */
  @IsBoolean() hologramIntact!: boolean;
  /** کد هولوگرام و شماره سریال کارخانه با سامانه مطابقت دارد */
  @IsBoolean() serialMatches!: boolean;
  /** بسته‌بندی/کارت اصالت سالم است */
  @IsBoolean() packagingIntact!: boolean;
  /** ظاهر شمش بدون خراش عمیق، فرورفتگی یا آثار دستکاری */
  @IsBoolean() surfaceIntact!: boolean;
  /** نتیجه‌ی آزمون عیار (XRF/محک) قابل قبول است */
  @IsBoolean() purityTestPassed!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  purityTestMethod?: string;
}

export class InspectBuybackDto {
  @IsBoolean()
  passed!: boolean;

  @ValidateNested()
  @Type(() => InspectionChecklistDto)
  checklist!: InspectionChecklistDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.001)
  @Max(100000)
  measuredWeightGrams?: number;

  /** عیار اندازه‌گیری‌شده در هزار (مثلاً 995) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(500)
  @Max(1000)
  measuredFineness?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class OfferBuybackDto {
  /** قیمت هر گرم شمش (ریال)؛ خالی = قیمت لحظه‌ای بر اساس عیار */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pricePerGramRial?: number;

  /** درصد کسر؛ خالی = تنظیمات buyback.deduction_percent */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(50)
  deductionPercent?: number;

  /** هزینه‌ی کارشناسی (ریال)؛ خالی = تنظیمات buyback.fee_rial */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  feeRial?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PayBuybackDto {
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  bankReference!: string;

  @IsOptional()
  @IsString()
  @Matches(/^1010\d*$/, { message: 'حساب مبدأ باید زیرمجموعه‌ی 1010 باشد' })
  sourceAccountCode?: string;

  @IsOptional()
  @IsIn([...PAYOUT_METHODS])
  payoutMethod?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
