// api/src/agent/agent.dto.ts
//
// DTOهای ماژول نمایندگان فروش (سمت مدیریت و پرتال نماینده). مبالغ همه به ریال.
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const IRAN_MOBILE = /^09\d{9}$/;
const NATIONAL_CODE = /^\d{10}$/;
const HOLOGRAM_CODE = /^\d{8}$/;

export const AGENT_STATUSES = ['ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export const AGENT_COMMISSION_TYPES = [
  'PERCENT',
  'PER_GRAM',
  'FIXED_PER_BAR',
] as const;
export const AGENT_SETTLEMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD_TO_CARD',
  'POS',
  'CHEQUE',
] as const;
export const AGENT_SALE_PAYMENT_METHODS = [
  'CASH',
  'POS',
  'CARD_TO_CARD',
  'BANK_TRANSFER',
  'CHEQUE',
] as const;
export const GOLD_PURITIES = ['K18', 'K24'] as const;

const toOptionalNumber = ({ value }: { value: unknown }) =>
  value === '' || value === null || value === undefined
    ? undefined
    : Number(value);

// ─────────────────────────── صفحه‌بندی مشترک ───────────────────────────

export class PageQueryDto {
  @IsOptional()
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 20;
}

export class DateRangeQueryDto extends PageQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'تاریخ شروع معتبر نیست' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ پایان معتبر نیست' })
  to?: string;
}

// ─────────────────────────── نماینده ───────────────────────────

export class CreateAgentDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsString()
  @Length(3, 80)
  managerName!: string;

  @IsOptional()
  @Matches(NATIONAL_CODE, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode?: string;

  @Matches(IRAN_MOBILE, { message: 'شماره موبایل نماینده معتبر نیست' })
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  contractNumber?: string;

  @IsOptional()
  @IsDateString()
  contractStartAt?: string;

  @IsOptional()
  @IsDateString()
  contractEndAt?: string;

  @IsIn(AGENT_COMMISSION_TYPES)
  commissionType!: (typeof AGENT_COMMISSION_TYPES)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionValue!: number;

  /** سقف بدهی مجاز (ریال) — خالی یعنی بدون سقف */
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  creditLimitRial?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(3, 80)
  managerName?: string;

  @IsOptional()
  @Matches(NATIONAL_CODE, { message: 'کد ملی باید ۱۰ رقم باشد' })
  nationalCode?: string;

  @IsOptional()
  @Matches(IRAN_MOBILE, { message: 'شماره موبایل نماینده معتبر نیست' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  contractNumber?: string;

  @IsOptional()
  @IsDateString()
  contractStartAt?: string;

  @IsOptional()
  @IsDateString()
  contractEndAt?: string;

  @IsOptional()
  @IsIn(AGENT_COMMISSION_TYPES)
  commissionType?: (typeof AGENT_COMMISSION_TYPES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionValue?: number;

  /** null = حذف سقف */
  @IsOptional()
  @Transform(({ value }) =>
    value === '' || value === null ? null : Number(value),
  )
  creditLimitRial?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ChangeAgentStatusDto {
  @IsIn(AGENT_STATUSES)
  status!: (typeof AGENT_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListAgentsQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(AGENT_STATUSES)
  status?: (typeof AGENT_STATUSES)[number];
}

// ─────────────────────────── حساب ورود نماینده ───────────────────────────

export class CreateAgentAccountDto {
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]{3,31}$/, {
    message:
      'نام کاربری باید با حرف انگلیسی شروع شود و ۴ تا ۳۲ کاراکتر (حرف، عدد، _ . -) باشد',
  })
  username!: string;

  @IsString()
  @MinLength(12, { message: 'رمز عبور باید حداقل ۱۲ کاراکتر باشد' })
  password!: string;

  @IsString()
  @Length(3, 80)
  fullName!: string;

  @IsOptional()
  @Matches(IRAN_MOBILE, { message: 'شماره موبایل معتبر نیست' })
  phone?: string;
}

export class UpdateAgentAccountDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(12, { message: 'رمز عبور باید حداقل ۱۲ کاراکتر باشد' })
  newPassword?: string;
}

// ─────────────────────────── تحویل امانی / عودت ───────────────────────────

export class AllocationItemDto {
  @Matches(HOLOGRAM_CODE, { message: 'کد هولوگرام باید ۸ رقم باشد' })
  code!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(10000)
  weightGrams!: number;

  @IsIn(GOLD_PURITIES)
  purityKarat!: (typeof GOLD_PURITIES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  factorySerialNumber?: string;

  @IsOptional()
  @IsDateString()
  mintedAt?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  /** اجرت/حق ضرب همین شمش (ریال) */
  @IsOptional()
  @Transform(toOptionalNumber)
  @IsNumber()
  @Min(0)
  premiumRial?: number;
}

export class AllocateStockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AllocationItemDto)
  items!: AllocationItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReturnStockDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Matches(HOLOGRAM_CODE, {
    each: true,
    message: 'کد هولوگرام باید ۸ رقم باشد',
  })
  codes!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class InventoryQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class MovementsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsIn(['ALLOCATION', 'RETURN', 'SALE', 'SALE_VOID'])
  type?: 'ALLOCATION' | 'RETURN' | 'SALE' | 'SALE_VOID';
}

// ─────────────────────────── فروش ───────────────────────────

export class CreateAgentSaleDto {
  @Matches(HOLOGRAM_CODE, { message: 'کد هولوگرام باید ۸ رقم باشد' })
  hologramCode!: string;

  /** شناسه‌ی استعلام قیمت — قیمت قفل‌شده در لحظه‌ی استعلام مبنای فروش است */
  @IsUUID()
  quoteId!: string;

  @Matches(IRAN_MOBILE, { message: 'شماره موبایل خریدار معتبر نیست' })
  buyerPhone!: string;

  @IsString()
  @Length(2, 50, { message: 'نام خریدار باید بین ۲ تا ۵۰ کاراکتر باشد' })
  buyerFirstName!: string;

  @IsString()
  @Length(2, 50, {
    message: 'نام خانوادگی خریدار باید بین ۲ تا ۵۰ کاراکتر باشد',
  })
  buyerLastName!: string;

  @Matches(NATIONAL_CODE, { message: 'کد ملی خریدار باید ۱۰ رقم باشد' })
  buyerNationalCode!: string;

  @IsDateString({}, { message: 'تاریخ تولد خریدار معتبر نیست' })
  buyerBirthDate!: string;

  @IsIn(AGENT_SALE_PAYMENT_METHODS)
  paymentMethod!: (typeof AGENT_SALE_PAYMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BuyerLookupQueryDto {
  @Matches(IRAN_MOBILE, { message: 'شماره موبایل معتبر نیست' })
  phone!: string;
}

export class ListSalesQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsIn(['COMPLETED', 'VOIDED'])
  status?: 'COMPLETED' | 'VOIDED';

  @IsOptional()
  @IsString()
  search?: string;
}

export class VoidSaleDto {
  @IsString()
  @MinLength(10, { message: 'دلیل ابطال باید حداقل ۱۰ کاراکتر باشد' })
  @MaxLength(500)
  reason!: string;
}

// ─────────────────────────── تسویه و اصلاحیه ───────────────────────────

export class CreateSettlementDto {
  @Type(() => Number)
  @IsNumber()
  @Min(10000, { message: 'حداقل مبلغ تسویه ۱۰٬۰۰۰ ریال است' })
  amountRial!: number;

  @IsIn(AGENT_SETTLEMENT_METHODS)
  method!: (typeof AGENT_SETTLEMENT_METHODS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceNumber?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListSettlementsQueryDto extends DateRangeQueryDto {
  @IsOptional()
  @IsUUID()
  agentId?: string;

  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED'])
  status?: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export class RejectSettlementDto {
  @IsString()
  @MinLength(5, { message: 'دلیل رد را وارد کنید' })
  @MaxLength(500)
  reason!: string;
}

export class CreateAdjustmentDto {
  /** INCREASE: افزایش بدهی نماینده (مثلاً جریمه) — DECREASE: کاهش بدهی (مثلاً پاداش/اصلاح کمیسیون) */
  @IsIn(['INCREASE', 'DECREASE'])
  direction!: 'INCREASE' | 'DECREASE';

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amountRial!: number;

  @IsString()
  @MinLength(10, { message: 'شرح اصلاحیه باید حداقل ۱۰ کاراکتر باشد' })
  @MaxLength(500)
  reason!: string;
}

export class StatementQueryDto extends DateRangeQueryDto {}

export class ReportQueryDto {
  @IsOptional()
  @IsDateString({}, { message: 'تاریخ شروع معتبر نیست' })
  from?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ پایان معتبر نیست' })
  to?: string;
}
