// admin/next.config.ts
import type { NextConfig } from "next";

// ── سرآیندهای امنیتی (FDP_ACC_EXT.1.3/1.4، FDP_RIP_EXT.1.2) ─────────────────
// CSP: منابع فقط از همین مبدأ و API خودمان بارگذاری می‌شوند (بدون CDN/سرویس ثالث).
const isDev = process.env.NODE_ENV !== "production";
const originOf = (u?: string) => {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
};
const apiOrigins = Array.from(
  new Set(
    [
      originOf(process.env.NEXT_PUBLIC_API_URL),
      originOf(process.env.NEXT_PUBLIC_NEST_ORIGIN),
      isDev ? "http://localhost:5000" : "https://api.arkan.gold",
    ].filter(Boolean) as string[],
  ),
).join(" ");
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigins}`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigins}${isDev ? " ws: wss:" : ""}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  // ارسال فرم فقط به همین مبدأ؛ انتقال به درگاه پرداخت با تغییر نشانی صفحه انجام می‌شود (نه فرم)
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // پنل مدیریت و پنل نمایندگان نباید در هیچ موتور جستجویی نمایه شوند (کاهش سطح شناسایی)
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];
// پاسخ‌های BFF و صفحات پویای حاوی داده‌ی کاربر هرگز در مرورگر/پراکسی/CDN کش نشوند
const noStore = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Pragma", value: "no-cache" },
];

// تعداد worker های build (جمع‌آوری داده‌ی صفحات و تولید ایستا). پیش‌فرض Next.js «تعداد CPU سرور
// منهای یک» است و در کانتینر رانفلر/لیارا تعداد هسته‌های کل سرور میزبان دیده می‌شود (مثلاً ۸۰)، نه سهم
// پلن؛ ده‌ها پردازش Node هم‌زمان حافظه‌ی پلن را پر می‌کرد و build در «Collecting page data» گیر می‌کرد.
const buildCpus = Math.max(1, Number(process.env.NEXT_BUILD_CPUS) || 2);

const nextConfig: NextConfig = {
  experimental: {
    cpus: buildCpus,
  },
  // یک نمونه‌ی مشترک axios برای همه‌ی routeها تا interceptor ارسال IP کاربر به API
  // (lib/client-identity.ts، نصب‌شده در instrumentation.ts) روی همه‌ی آن‌ها اعمال شود
  serverExternalPackages: ["axios"],

  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // کل پنل مدیریت پویا و حاوی داده‌ی حساس است؛ فقط فایل‌های ایستای ساخت (_next/static) کش می‌شوند
      { source: "/((?!_next/static|_next/image|fonts|icons|brand|favicon.ico).*)", headers: noStore },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Content-Type", value: "application/manifest+json" }],
      },
    ];
  },
};

export default nextConfig;
