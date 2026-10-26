// api/src/common/network/cors-origins.ts
//
// دامنه‌های مجاز CORS — arkan.gold (سایت اصلی) و app.arkan.gold/admin هر دو باید
// بتوانند مستقیماً از مرورگر به API عمومی هولوگرام (POST /public/hologram/verify)
// و سایر endpointها دسترسی داشته باشند (بند ۴.۱). دامنه‌های اضافه را می‌توان بدون
// تغییر کد از طریق CORS_EXTRA_ORIGINS (جدا شده با کاما) اضافه کرد.
// نشانی‌های localhost فقط در محیط توسعه پذیرفته می‌شوند (نه در production)
const DEV_CORS_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

export const PRODUCTION_CORS_ORIGINS = [
  'https://arkan.gold',
  'https://www.arkan.gold',
  'https://app.arkan.gold',
  'https://admin.arkan.gold',
  // پنل نمایندگان فروش (همان برنامه‌ی admin روی دامنه‌ی جدا)
  'https://panel.arkan.gold',
];

export function resolveCorsOrigins(): string[] {
  const extra = (process.env.CORS_EXTRA_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const base =
    process.env.NODE_ENV === 'production'
      ? PRODUCTION_CORS_ORIGINS
      : [...DEV_CORS_ORIGINS, ...PRODUCTION_CORS_ORIGINS];
  return [...base, ...extra];
}
