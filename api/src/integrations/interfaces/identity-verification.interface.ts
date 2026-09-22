export interface IdentityVerificationInput {
  /** کد ملی ۱۰ رقمی */
  nationalCode: string;
  /** تاریخ تولد میلادی به فرمت yyyy-mm-dd — تبدیل به فرمت مورد نیاز هر Provider بر عهده خودِ Adapter است */
  birthDate: string;
  firstName?: string;
  lastName?: string;
}

export interface IdentityVerificationResult {
  matched: boolean;
  /** در صورت matched=false، دلیل عدم تطابق (برای نمایش/بررسی دستی) */
  reason?: string;
  firstName?: string;
  lastName?: string;
  fatherName?: string;
  deathStatus?: string;
  gender?: string;
  /** شماره/سری/سریال شناسنامه و محل صدور — فقط Providerهایی که مشخصات ثبت احوال کامل برمی‌گردانند (مثل فینوتک) این‌ها را پر می‌کنند */
  identityNo?: number;
  identitySeri?: string;
  identitySerial?: string;
  officeName?: string;
  officeCode?: string;
  /** کد رهگیری ثبت احوال (مجزا از providerRequestId که شناسه درخواست ماست) */
  civilRegistryTrackingCode?: string;
  /** شناسه رهگیری سمت Provider، برای Trace کردن در IntegrationLog */
  providerRequestId?: string;
  /** کد Providerای که واقعاً این استعلام را انجام داده (FINOTECH/MOCK) — توسط IdentityVerificationService پر می‌شود */
  verifiedByProvider?: string;
}

/**
 * هر Adapter (Finotech، Mock و در آینده هر شرکت دیگر) این Contract را پیاده می‌کند.
 * Business Logic (مثلاً UsersService) هرگز مستقیماً این Interface را import نمی‌کند؛
 * فقط با IdentityVerificationService (در services/identity-verification.service.ts) کار می‌کند.
 */
export interface IdentityVerificationProvider {
  readonly providerCode: string;
  verifyIdentity(
    input: IdentityVerificationInput,
  ): Promise<IdentityVerificationResult>;
}
