// api/src/common/environment/test-integrations.ts
//
// ارائه‌دهنده‌های آزمایشی (Mock) و حالت‌های Sandbox درگاه پرداخت/استعلام در production مسدودند:
// Mock هر کد ملی و کارتی را تأیید می‌کند و Sandbox پرداخت بدون واریز واقعی را موفق اعلام می‌کند.
// فقط برای دوره‌ی گذار و با پذیرش صریح ریسک، ALLOW_TEST_INTEGRATIONS_IN_PRODUCTION=true این مسدودیت
// را برمی‌دارد (در راه‌اندازی هشدار داده می‌شود).

export const ALLOW_TEST_INTEGRATIONS_ENV =
  'ALLOW_TEST_INTEGRATIONS_IN_PRODUCTION';

export const MOCK_PROVIDER_CODE = 'MOCK';

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** آیا Mock/Sandbox در این محیط مسدود است؟ */
export function testIntegrationsBlocked(): boolean {
  return isProduction() && process.env[ALLOW_TEST_INTEGRATIONS_ENV] !== 'true';
}
