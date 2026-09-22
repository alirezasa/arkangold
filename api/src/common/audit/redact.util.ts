// api/src/common/audit/redact.util.ts
// پاسخ به FAU_GEN_EXT.1.4: جلوگیری از ثبت داده‌های حساس در رویدادهای امنیتی.
// پیش از ذخیره‌ی هر payload (oldValue/newValue) در جدول‌های audit، کلیدهایی که
// می‌توانند حاوی اطلاعات حساس (رمز، توکن، شماره کارت، کد ملی و...) باشند
// با «[REDACTED]» جایگزین می‌شوند.

const SENSITIVE_KEY_FRAGMENTS = [
  // اطلاعات احراز هویت و امنیتی — ثبت اکیداً ممنوع (بدون استثنای پوشاندن)
  'password',
  'passwordhash',
  'secret',
  'token',
  'otp',
  'privatekey',
  'apikey',
  'totp',
  'backupcode',
  'authorization',
  'cookie',
  'sessionid',
  'refreshtokenhash',
  'pin',
  // اطلاعات مالی حساس — ثبت اکیداً ممنوع (بدون استثنای پوشاندن)
  'cvv',
  'cvc',
  'expirydate',
  'creditscore',
  'creditlimit',
  'salary',
  'payroll',
  'investment',
  'assetvalue',
  // اطلاعات هویتی و مالی — فقط با پوشاندن مجاز است؛ محافظه‌کارانه کاملاً حذف می‌شود
  'cardnumber',
  'iban',
  'shaba',
  'accountnumber',
  'nationalid',
  'nationalcode',
  'melicode',
  'cardserial',
  'birthdate',
  'birthplace',
  'phone',
  'mobile',
  'postaladdress',
  'postalcode',
  // داده‌های رفتاری/موقعیت مکانی — ثبت اکیداً ممنوع
  'latitude',
  'longitude',
  'gpscoordinate',
  'geolocation',
];

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment));
}

const MAX_DEPTH = 6;

/** به‌صورت بازگشتی یک مقدار را پاکسازی می‌کند: کلیدهای حساس پوشانده و انواع خاص (Date/Decimal) به مقدار قابل‌سریالایز تبدیل می‌شوند. */
export function redact(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  // Date، Prisma.Decimal و مشابه معمولاً toJSON دارند (مثلاً به ISO string یا رشته)
  const maybeToJSON = (value as { toJSON?: () => unknown }).toJSON;
  if (typeof maybeToJSON === 'function') {
    return maybeToJSON.call(value);
  }

  if (depth >= MAX_DEPTH) return '[Truncated]';
  if (seen.has(value as object)) return '[Circular]';
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? '[REDACTED]' : redact(val, depth + 1, seen);
  }
  return output;
}
