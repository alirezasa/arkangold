export const FINOTECH_PROVIDER_CODE = 'FINOTECH';

/**
 * هر سرویس فینوتک Scope جداگانه‌ای دارد و توکن Client Credential برای همان Scope
 * صادر می‌شود؛ برای همین توکن هر Scope جدا گرفته و Cache می‌شود تا نبودِ یک Scope
 * روی کلاینت (مثلاً شاهکار هنوز فعال نشده) بقیه‌ی سرویس‌ها را از کار نیندازد.
 */
export const FINOTECH_SCOPES = {
  IDENTITY_INQUIRY: 'kyc:identification-inquiry:get',
  SHAHKAR: 'facility:shahkar:get',
  CARD_OWNER_VERIFICATION: 'kyc:card-owner-verification:post',
  CARD_TO_IBAN: 'facility:card-to-iban:get',
} as const;

export type FinotechScope =
  (typeof FINOTECH_SCOPES)[keyof typeof FINOTECH_SCOPES];

/** برچسب فارسی هر Scope برای نمایش نتیجه‌ی تست اتصال در پنل ادمین */
export const FINOTECH_SCOPE_LABELS: Record<FinotechScope, string> = {
  [FINOTECH_SCOPES.IDENTITY_INQUIRY]: 'استعلام اطلاعات هویتی',
  [FINOTECH_SCOPES.SHAHKAR]: 'شاهکار (تطبیق موبایل و کد ملی)',
  [FINOTECH_SCOPES.CARD_OWNER_VERIFICATION]: 'تطبیق شماره کارت و کد ملی',
  [FINOTECH_SCOPES.CARD_TO_IBAN]: 'تبدیل کارت به شبا',
};

export const FINOTECH_CONFIG = {
  // آدرس‌های Sandbox و Production طبق مستندات فینوتک؛ انتخاب بین این دو با
  // کلید SystemConfig زیر (از پنل ادمین، بدون نیاز به Deploy مجدد) انجام می‌شود —
  // دقیقاً همان الگوی payment.zarinpal.sandbox که قبلاً در پروژه پیاده شده.
  SANDBOX_BASE_URL: 'https://sandboxapi.finnotech.ir',
  PRODUCTION_BASE_URL: 'https://api.finnotech.ir',
  SANDBOX_SYSTEM_CONFIG_KEY: 'identity.finotech.sandbox',
  TOKEN_PATH: '/dev/v2/oauth2/token',
  IDENTITY_INQUIRY_PATH: (clientId: string) =>
    `/kyc/v2/clients/${clientId}/identificationInquiry`,
  // GET ?mobile&nationalCode&trackId
  SHAHKAR_PATH: (clientId: string) =>
    `/facility/v2/clients/${clientId}/shahkar/verify`,
  // POST body {card, nid} — ?trackId
  CARD_OWNER_VERIFICATION_PATH: (clientId: string) =>
    `/kyc/v2/clients/${clientId}/cardOwnerVerification`,
  // GET ?card&version=2&trackId
  CARD_TO_IBAN_PATH: (clientId: string) =>
    `/facility/v2/clients/${clientId}/cardToIban`,
  GRANT_TYPE: 'client_credentials',
  TOKEN_CACHE_KEY: 'finotech:access_token',
  // فینوتک در پاسخ Token معمولاً expires_in برمی‌گرداند؛ برای احتیاط کمی زودتر منقضی می‌کنیم
  TOKEN_EXPIRY_SAFETY_MARGIN_SECONDS: 30,
} as const;

// این کلیدها همان چیزی هستند که در Admin Panel زیر Provider=FINOTECH ذخیره می‌شوند (رمزنگاری‌شده)
export const FINOTECH_CREDENTIAL_KEYS = {
  CLIENT_ID: 'CLIENT_ID',
  CLIENT_SECRET: 'CLIENT_SECRET',
  // کد ملی ۱۰ رقمی صاحب کلاینت که طبق مستندات در body درخواست توکن الزامی است
  NID: 'NID',
} as const;

/** trackId فینوتک حداکثر ۴۰ کاراکتر است */
export function finotechTrackId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now()}-${random}`.slice(0, 40);
}
