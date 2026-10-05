/**
 * تطبیق شاهکار: آیا شماره موبایل متعلق به همان کد ملی است؟
 * (فینوتک: GET /facility/v2/clients/{clientId}/shahkar/verify)
 */
export interface MobileNationalIdMatchInput {
  /** موبایل به قالب 09xxxxxxxxx */
  mobile: string;
  /** کد ملی ۱۰ رقمی */
  nationalCode: string;
}

export interface MobileNationalIdMatchResult {
  matched: boolean;
  /** در صورت matched=false، پیام Provider (برای ثبت/نمایش به ادمین) */
  reason?: string;
  providerRequestId?: string;
  /** توسط MobileNationalIdMatchService پر می‌شود */
  verifiedByProvider?: string;
}

export interface MobileNationalIdMatchProvider {
  readonly providerCode: string;
  match(
    input: MobileNationalIdMatchInput,
  ): Promise<MobileNationalIdMatchResult>;
}
