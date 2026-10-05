/**
 * تبدیل کارت به شبا
 * (فینوتک: GET /facility/v2/clients/{clientId}/cardToIban?card&version=2)
 */
export interface CardToIbanInput {
  cardNumber: string;
}

/** کد وضعیت حساب طبق فینوتک */
export const DEPOSIT_STATUS_LABELS: Record<string, string> = {
  '02': 'حساب فعال',
  '03': 'مسدود با قابلیت واریز',
  '04': 'مسدود بدون قابلیت واریز',
  '05': 'حساب راکد',
  '06': 'خطا در پاسخ‌دهی بانک',
  '07': 'سایر موارد',
};

/** حساب‌هایی که می‌توان به آن‌ها واریز کرد (برداشت ریالی کاربر به این حساب واریز می‌شود) */
export const DEPOSITABLE_STATUSES = ['02', '03'];
/** وضعیت‌هایی که قطعاً امکان واریز ندارند → کاربر باید کارت دیگری ثبت کند */
export const BLOCKED_DEPOSIT_STATUSES = ['04', '05'];

export interface CardToIbanResult {
  /** false یعنی Provider کارت را نشناخت/شبا برنگرداند (نتیجه‌ی کسب‌وکاری، نه خطای فنی) */
  found: boolean;
  reason?: string;
  iban?: string;
  bankName?: string;
  /** شماره حساب */
  deposit?: string;
  depositStatus?: string;
  /** صاحبان حساب (رشته‌ی خام Provider) */
  depositOwners?: string;
  providerRequestId?: string;
  /** توسط CardToIbanService پر می‌شود */
  verifiedByProvider?: string;
}

export interface CardToIbanProvider {
  readonly providerCode: string;
  convert(input: CardToIbanInput): Promise<CardToIbanResult>;
}
