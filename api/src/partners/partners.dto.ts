// api/src/partners/partners.dto.ts
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const PARTNER_KINDS = [
  'BNPL',
  'RESELLER_APP',
  'MARKETPLACE',
  'CORPORATE',
  'OTHER',
] as const;
export const PARTNER_STATUSES = ['ACTIVE', 'SUSPENDED', 'TERMINATED'] as const;
export const PARTNER_PRODUCTS = ['MELTED_GOLD', 'BULLION'] as const;
const METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CARD_TO_CARD',
  'POS',
  'CHEQUE',
] as const;

export class PageQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class PartnerDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsIn(PARTNER_KINDS) kind?: (typeof PARTNER_KINDS)[number];
  @IsOptional() @Matches(/^[A-Z0-9_]{2,30}$/) providerKey?: string;
  @IsOptional()
  @IsIn(PARTNER_STATUSES)
  status?: (typeof PARTNER_STATUSES)[number];
  @IsOptional() @IsNumberString() commissionPercent?: string;
  @IsOptional() @IsNumberString() commissionFixedRial?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  settlementDays?: number;
  @IsOptional() @IsNumberString() creditLimitRial?: string;
  @IsOptional() @IsNumberString() minOrderRial?: string;
  @IsOptional() @IsNumberString() maxOrderRial?: string;
  @IsOptional()
  @IsArray()
  @IsIn(PARTNER_PRODUCTS, { each: true })
  allowedProducts?: (typeof PARTNER_PRODUCTS)[number][];
  @IsOptional() @IsString() @MaxLength(60) contractNumber?: string;
  @IsOptional() @IsDateString() contractStartAt?: string;
  @IsOptional() @IsDateString() contractEndAt?: string;
  @IsOptional() @IsString() @MaxLength(100) contactName?: string;
  @IsOptional() @IsString() @MaxLength(20) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(120) email?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @Matches(/^(IR)?\d{24}$/) iban?: string;
  @IsOptional() @IsString() @MaxLength(20) nationalId?: string;
  @IsOptional() @IsString() @MaxLength(20) economicCode?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsBoolean() apiEnabled?: boolean;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  apiIpWhitelist?: string[];
  @IsOptional() @IsUrl({ require_tld: false }) webhookUrl?: string;
}

export class ListPartnersQueryDto extends PageQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(PARTNER_STATUSES) status?: string;
}

export class PartnerOrderDto {
  @IsUUID() partnerId!: string;
  @IsString() @MinLength(1) @MaxLength(100) externalRef!: string;
  /** مشتری با شماره موبایل ثبت‌شده در آرکان گلد شناسایی می‌شود */
  @Matches(/^09\d{9}$/, { message: 'شماره موبایل مشتری نامعتبر است' })
  customerPhone!: string;
  @IsOptional() @Matches(/^\d{10}$/) customerNationalCode?: string;
  @IsIn(PARTNER_PRODUCTS) productKind!: (typeof PARTNER_PRODUCTS)[number];
  /** آب‌شده: گرم ۷۵۰ — یا به‌جای آن مبلغ ریالی */
  @IsOptional() @IsNumberString() amountGrams?: string;
  @IsOptional() @IsNumberString() amountRial?: string;
  /** شمش: کد هولوگرام شمش کددار خزانه */
  @IsOptional() @Matches(/^\d{8}$/) hologramCode?: string;
  /** قیمت توافقی هر گرم (اختیاری) — خالی = قیمت لحظه‌ای */
  @IsOptional() @IsNumberString() pricePerGramRial?: string;
  @IsOptional() @IsNumberString() wageRial?: string;
  @IsOptional() @IsNumberString() taxRial?: string;
  @IsOptional() @IsNumberString() downPaymentRial?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  installmentCount?: number;
  @IsOptional() @IsObject() installmentPlan?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** ثبت و تأیید در یک مرحله (سفارش‌های تأییدشده‌ی شریک که دستی وارد می‌شوند) */
  @IsOptional() @IsBoolean() confirmNow?: boolean;
}

export class ListPartnerOrdersQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'SETTLED', 'CANCELLED', 'REFUNDED'])
  status?: string;
  @IsOptional() @IsIn(PARTNER_PRODUCTS) productKind?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsIn(['true', 'false']) overdue?: string;
}

export class ReasonDto {
  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}

export class PartnerSettlementDto {
  @IsUUID() partnerId!: string;
  @IsNumberString() amountRial!: string;
  @IsIn(METHODS) method!: (typeof METHODS)[number];
  @IsOptional() @Matches(/^1010\d*$/) cashAccountCode?: string;
  @IsOptional() @IsString() @MaxLength(60) referenceNumber?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  /** سفارش‌هایی که این واریز بابت آن‌هاست؛ خالی + autoAllocate = تخصیص خودکار به قدیمی‌ترین سررسیدها */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsUUID('all', { each: true })
  orderIds?: string[];
  @IsOptional() @IsBoolean() autoAllocate?: boolean;
}

export class ListSettlementsQueryDto extends PageQueryDto {
  @IsOptional() @IsUUID() partnerId?: string;
}

export class StatementQueryDto extends PageQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class PartnerReportQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

// ── API عمومی شرکا ──

export class ApiCreateOrderDto {
  @IsString() @MinLength(1) @MaxLength(100) externalRef!: string;
  @Matches(/^09\d{9}$/) customerPhone!: string;
  @Matches(/^\d{10}$/) customerNationalCode!: string;
  @IsOptional() @IsNumberString() amountGrams?: string;
  @IsOptional() @IsNumberString() amountRial?: string;
  @IsOptional() @IsNumberString() downPaymentRial?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  installmentCount?: number;
  @IsOptional() @IsObject() installmentPlan?: Record<string, unknown>;
}

export class ApiCancelDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
