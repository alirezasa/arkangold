export const FINOTECH_PROVIDER_CODE = 'FINOTECH';

export const FINOTECH_CONFIG = {
  BASE_URL: 'https://api.finnotech.ir',
  TOKEN_PATH: '/dev/v2/oauth2/token',
  IDENTITY_INQUIRY_PATH: (clientId: string) => `/kyc/v2/clients/${clientId}/identificationInquiry`,
  SCOPE: 'kyc:identification-inquiry:get',
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
