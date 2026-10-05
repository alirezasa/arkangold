// api/src/common/auth-security/auth-paths.const.ts
//
// FIA_UAU_EXT.2.4 — فهرست کامل و مستند مسیرهای احراز هویت محصول. هر مسیر دیگری که نشست صادر کند
// وجود ندارد؛ مسیرهای قدیمی/آزمایشی (ورود تک‌عاملی پیامکی send-login-otp و verify-login-otp،
// و ورود پنل بدون بررسی درگاه) حذف شده‌اند. این فهرست در پنل «امنیت» و مستند FIA نمایش داده می‌شود.

export interface AuthPathInfo {
  audience: 'کاربر' | 'ادمین' | 'نماینده' | 'شریک فروش';
  name: string;
  steps: string[];
  factors: string;
  endpoints: string[];
}

export const AUTH_PATHS: AuthPathInfo[] = [
  {
    audience: 'کاربر',
    name: 'ثبت‌نام',
    steps: ['کد پیامکی به شماره', 'تعیین رمز عبور (سیاست رمز)'],
    factors: 'مالکیت شماره + دانستنی',
    endpoints: [
      'POST /auth/send-otp',
      'POST /auth/verify-otp',
      'POST /auth/set-password',
    ],
  },
  {
    audience: 'کاربر',
    name: 'ورود',
    steps: [
      'رمز عبور (+ بررسی امنیتی در صورت ریسک)',
      'کد برنامه‌ی احراز هویت اگر فعال است، وگرنه کد پیامکی',
    ],
    factors: 'دانستنی + داشتنی (TOTP یا پیامک)',
    endpoints: [
      'POST /auth/login',
      'POST /auth/login/verify',
      'POST /auth/login/resend',
    ],
  },
  {
    audience: 'کاربر',
    name: 'بازیابی رمز عبور',
    steps: [
      'کد پیامکی (پاسخ یکسان برای همه‌ی شماره‌ها)',
      'کد برنامه‌ی احراز هویت اگر فعال است',
      'رمز جدید (سیاست رمز) — همه‌ی نشست‌ها بسته می‌شوند',
    ],
    factors: 'داشتنی (+ TOTP در صورت فعال بودن)',
    endpoints: [
      'POST /auth/forgot-password',
      'POST /auth/verify-reset-otp',
      'POST /auth/reset-password/verify-mfa',
      'POST /auth/reset-password',
    ],
  },
  {
    audience: 'کاربر',
    name: 'تمدید نشست',
    steps: ['توکن تمدید یک‌بارمصرف (چرخشی) در کوکی HttpOnly'],
    factors: 'نشست موجود',
    endpoints: ['POST /auth/refresh-token'],
  },
  {
    audience: 'ادمین',
    name: 'ورود پنل مدیریت',
    steps: [
      'نام کاربری و رمز عبور (+ بررسی امنیتی در صورت ریسک)',
      'تغییر اجباری رمز موقت (در صورت وجود)',
      'راه‌اندازی اجباری یا بررسی برنامه‌ی احراز هویت',
    ],
    factors: 'دانستنی + داشتنی (TOTP اجباری)',
    endpoints: [
      'POST /admin-auth/login',
      'POST /admin-auth/login/change-password',
      'POST /admin-auth/login/mfa-setup',
      'POST /admin-auth/login/mfa-setup/confirm',
      'POST /admin-auth/login/mfa',
    ],
  },
  {
    audience: 'نماینده',
    name: 'ورود پنل نمایندگان',
    steps: [
      'رمز عبور یا کد پیامکی به شماره‌ی ثبت‌شده توسط مدیر',
      'راه‌اندازی اجباری یا بررسی برنامه‌ی احراز هویت',
    ],
    factors: 'دانستنی/داشتنی + TOTP اجباری',
    endpoints: [
      'POST /admin-auth/login (portal=agent)',
      'POST /admin-auth/agent-otp/request',
      'POST /admin-auth/agent-otp/verify',
      'POST /admin-auth/login/mfa-setup(/confirm)',
      'POST /admin-auth/login/mfa',
    ],
  },
  {
    audience: 'ادمین',
    name: 'تمدید نشست پنل',
    steps: ['توکن تمدید یک‌بارمصرف (چرخشی) در کوکی HttpOnly'],
    factors: 'نشست موجود',
    endpoints: ['POST /admin-auth/refresh'],
  },
  {
    audience: 'شریک فروش',
    name: 'API شرکا',
    steps: [
      'کلید API (هش SHA-256 ذخیره می‌شود) با تاریخ انقضا + فهرست IP مجاز',
    ],
    factors: 'کلید ماشین‌به‌ماشین',
    endpoints: ['X-Api-Key → /partner-api/v1/*'],
  },
];
