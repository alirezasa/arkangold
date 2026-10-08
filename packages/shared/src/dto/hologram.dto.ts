import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  HologramCodeStatus,
  HologramIncidentStatus,
  HologramIncidentType,
  HologramInquiryChannel,
  HologramInquiryResult,
  HologramTransferRequestStatus,
  ShopOrderItemRecipientType,
} from '../enums';

const HOLOGRAM_CODE_PATTERN = /^\d{8}$/;
const IRAN_MOBILE_PATTERN = /^09\d{9}$/;
const NATIONAL_CODE_PATTERN = /^\d{10}$/;

export class VerifyHologramCodeDto {
  @IsString()
  @Length(8, 8, { message: 'کد هولوگرام باید دقیقاً ۸ رقم باشد' })
  @Matches(HOLOGRAM_CODE_PATTERN, { message: 'کد هولوگرام باید فقط شامل اعداد باشد' })
  code!: string;
}

// ─────────────────────────── چک‌اوت — گیرنده هر آیتم ───────────────────────────

export class ShopOrderItemRecipientDto {
  @IsUUID()
  cartItemId!: string;

  @IsIn(Object.values(ShopOrderItemRecipientType))
  recipientType!: ShopOrderItemRecipientType;

  // فقط وقتی گیرنده «فرد دیگر» است لازم است
  @ValidateIf((o) => o.recipientType === ShopOrderItemRecipientType.OTHER)
  @IsString()
  @Matches(IRAN_MOBILE_PATTERN, { message: 'شماره موبایل گیرنده معتبر نیست' })
  recipientPhoneNumber?: string;
}

// ─────────────────────────────── ادمین — دسته و کد ───────────────────────────────

export class CreateHologramBatchDto {
  @IsInt()
  @Min(1)
  @Max(10000)
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class GetHologramBatchesQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class GetHologramCodesQueryDto {
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
  @IsIn(Object.values(HologramCodeStatus))
  status?: HologramCodeStatus;

  @IsOptional()
  @IsUUID()
  batchId?: string;

  /** فقط شمش‌هایی که گزارش سرقت/مفقودی فعال دارند */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  flagged?: boolean;

  // جستجو بر اساس کد، شماره سریال کارخانه یا نام/کدملی مالک فعلی
  @IsOptional()
  @IsString()
  search?: string;
}

export class AssignHologramCodeDto {
  @IsUUID()
  shopOrderItemId!: string;

  @IsOptional()
  @IsString()
  factorySerialNumber?: string;

  @IsOptional()
  @IsDateString()
  mintedAt?: string;
}

export class RevokeHologramCodeDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class GetHologramInquiryLogsQueryDto {
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
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsIn(Object.values(HologramInquiryResult))
  result?: HologramInquiryResult;

  @IsOptional()
  @IsIn(Object.values(HologramInquiryChannel))
  channel?: HologramInquiryChannel;

  /** فقط استعلام‌های شمش‌هایی که در آن لحظه گزارش سرقت/مفقودی فعال داشتند */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  flaggedOnly?: boolean;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class GetHologramTransferRequestsQueryDto {
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
  @IsIn(Object.values(HologramTransferRequestStatus))
  status?: HologramTransferRequestStatus;
}

export class GetHologramRateLimitBlocksQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  // پیش‌فرض فقط مسدودیت‌های فعال نمایش داده می‌شود
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  includeExpired?: boolean;
}

export class UpdateHologramSecuritySettingsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  rateLimitPerMinute?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  invalidAttemptsThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  invalidAttemptsWindowMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10080)
  blockDurationMinutes?: number;
}

// ────────────────────────────── انتقال مالکیت (کاربر) ──────────────────────────────

export class InitiateHologramTransferDto {
  @IsUUID()
  hologramCodeId!: string;

  @IsString()
  @Matches(IRAN_MOBILE_PATTERN, { message: 'شماره موبایل گیرنده معتبر نیست' })
  recipientPhoneNumber!: string;
}

/**
 * تأیید انتقال توسط گیرنده — احراز هویت اجباری (بند ۳.۴). اطلاعات هویتی مستقیماً
 * از گیرنده گرفته و به سرویس احراز هویت (Finotech) ارسال می‌شود؛ حتی اگر گیرنده
 * قبلاً هویتش را در پروفایل تأیید کرده باشد، این استعلام تازه snapshot نام/کدملی
 * لحظه انتقال را تضمین می‌کند.
 */
export class ConfirmHologramTransferDto {
  @IsString()
  @Length(2, 50, { message: 'نام باید بین ۲ تا ۵۰ کاراکتر باشد' })
  firstName!: string;

  @IsString()
  @Length(2, 50, { message: 'نام‌خانوادگی باید بین ۲ تا ۵۰ کاراکتر باشد' })
  lastName!: string;

  @IsString()
  @Length(10, 10, { message: 'کد ملی باید ۱۰ رقم باشد' })
  @Matches(NATIONAL_CODE_PATTERN, { message: 'کد ملی باید فقط شامل اعداد باشد' })
  nationalCode!: string;

  @IsDateString({}, { message: 'تاریخ تولد معتبر نیست' })
  birthDate!: string;
}

export class RejectHologramTransferDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

// ─────────────────────────── گزارش سرقت / مفقودی ───────────────────────────

class HologramIncidentDetailsDto {
  @IsIn(Object.values(HologramIncidentType), { message: 'نوع گزارش معتبر نیست' })
  type!: HologramIncidentType;

  @IsString()
  @Length(10, 1000, { message: 'شرح ماجرا باید بین ۱۰ تا ۱۰۰۰ کاراکتر باشد' })
  description!: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ وقوع معتبر نیست' })
  incidentAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  incidentLocation?: string;

  /** شماره‌ی صورتجلسه/گزارش کلانتری (برای سرقت توصیه می‌شود) */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  policeReportNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(IRAN_MOBILE_PATTERN, { message: 'شماره تماس معتبر نیست' })
  contactPhone?: string;
}

/** اعلام سرقت/مفقودی توسط مالک از پنل کاربری */
export class CreateHologramIncidentDto extends HologramIncidentDetailsDto {
  @IsUUID()
  hologramCodeId!: string;
}

/** ثبت گزارش توسط کارشناس (مثلاً سرقت از خزانه یا نماینده) */
export class AdminCreateHologramIncidentDto extends HologramIncidentDetailsDto {
  @IsString()
  @Matches(HOLOGRAM_CODE_PATTERN, { message: 'کد هولوگرام باید ۸ رقم باشد' })
  code!: string;
}

export class CancelHologramIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReviewHologramIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CloseHologramIncidentDto {
  @IsString()
  @Length(5, 1000, { message: 'توضیح باید حداقل ۵ کاراکتر باشد' })
  reason!: string;
}

export class GetHologramIncidentsQueryDto {
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
  @IsIn(Object.values(HologramIncidentStatus))
  status?: HologramIncidentStatus;

  /** فقط گزارش‌های فعال (ثبت‌شده/تأییدشده) */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  activeOnly?: boolean;

  @IsOptional()
  @IsIn(Object.values(HologramIncidentType))
  type?: HologramIncidentType;

  /** کد هولوگرام، شماره گزارش، نام/کدملی مالک یا موبایل گزارش‌دهنده */
  @IsOptional()
  @IsString()
  search?: string;
}
