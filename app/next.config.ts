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
  // فرم پرداخت به درگاه بانکی (POST) ارسال می‌شود
  "form-action 'self' https:",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev
    ? []
    : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];
// پاسخ‌های BFF و صفحات پویای حاوی داده‌ی کاربر هرگز در مرورگر/پراکسی/CDN کش نشوند
const noStore = [
  { key: "Cache-Control", value: "no-store, max-age=0" },
  { key: "Pragma", value: "no-cache" },
];

const nextConfig: NextConfig = {
  // یک نمونه‌ی مشترک axios برای همه‌ی routeها تا interceptor ارسال IP کاربر به API
  // (lib/client-identity.ts، نصب‌شده در instrumentation.ts) روی همه‌ی آن‌ها اعمال شود
  serverExternalPackages: ["axios"],

  // ── PWA / Service Worker ─────────────────────────────────────
  // The sw.js is in /public so it's served at the root scope.
  // No extra config needed unless you use next-pwa package.

  // ── Security headers ─────────────────────────────────────────
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      { source: "/api/:path*", headers: noStore },
      { source: "/dashboard/:path*", headers: noStore },
      { source: "/dashboard", headers: noStore },
      {
        // Service worker must be served with correct MIME type
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
        // Manifest
        source: "/manifest.json",
        headers: [
          { key: "Content-Type", value: "application/manifest+json" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
    ];
  },

  // ── Images ──────────────────────────────────────────────────
  images: {
    formats: ["image/avif", "image/webp"],
  },

  // ── Compression ─────────────────────────────────────────────
  compress: true,

  // ── Strict mode ─────────────────────────────────────────────
  reactStrictMode: true,
};

export default nextConfig;
