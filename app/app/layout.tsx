import type { Metadata, Viewport } from "next";
import localFont from "next/font/local"; // ۱. تغییر ایمپورت به local
import PWAProvider from "./dashboard/components/PWAProvider"; 
import LiveChatWidget from "./components/livechat/LiveChatWidget";
// آیکون‌های Tabler از خود سایت (قبلاً از CDN jsdelivr بارگذاری می‌شد که در صورت
// کندی/فیلتر شدن، آیکون‌ها — از جمله ضربدر بستن منو و آیکون‌های منوی پایین — دیده نمی‌شدند)
import "@tabler/icons-webfont/tabler-icons.min.css";
import "./globals.css";
import { NEST } from "./api/_lib/proxy";
import { DEFAULT_THEME_COLOR, fetchTheme } from "./lib/theme";


// ۲. تعریف فونت دانا با مسیر جدید (public/fonts)
const dana = localFont({
  src: [
    {
      path: "../public/fonts/DanaFaNum-Regular.woff", // اضافه شدن ../public
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/DanaFaNum-Bold.woff",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/DanaFaNum-Bold.woff",
      weight: "700",
      style: "normal",
    },
    {
      path: "../public/fonts/DanaFaNum-Bold.woff",
      weight: "900",
      style: "normal",
    },
  ],
  variable: "--font-dana",
});

// تنظیمات PWA و متادیتا
export const metadata: Metadata = {
  title: "آرکان گلد | پلتفرم طلای آب‌شده",
  description: "خرید و فروش امن طلای آب‌شده",
  applicationName: "آرکان گلد",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // iOS: اجرای تمام‌صفحه بعد از «Add to Home Screen»؛ نوار وضعیت شفاف است تا رنگ
  // برند (نوار .pwa-status-bar) زیر ساعت و باتری دیده شود
  appleWebApp: {
    capable: true,
    title: "آرکان گلد",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: { "mobile-web-app-capable": "yes" },
};

export async function generateViewport(): Promise<Viewport> {
  const theme = await fetchTheme(NEST);
  return {
    // رنگ نوار وضعیت/آدرس در Android و Safari — رنگ اصلی تنظیم‌شده در پنل مدیریت (ظاهر، رنگ و فونت)
    themeColor: theme?.themeColor ?? DEFAULT_THEME_COLOR,
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    // بدون cover، مقدار env(safe-area-inset-*) در آیفون همیشه صفر است
    viewportFit: "cover",
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // رنگ‌ها و فونت سیستم (پنل مدیریت ← ظاهر، رنگ و فونت)؛ بدون پاسخ API پیش‌فرض‌های globals.css
  const theme = await fetchTheme(NEST);
  return (
    // ۳. تزریق متغیر دانا و اعمال کلاس font-sans پیش‌فرض تلوند روی کل پروژه
    <html lang="fa" dir="rtl" className={`${dana.variable} font-sans`}>
      {theme && (
        <head>
          <style id="arkan-theme" dangerouslySetInnerHTML={{ __html: theme.css }} />
        </head>
      )}
      <body className="antialiased bg-gray-50 text-gray-900">
        {/* پس‌زمینه‌ی ناحیه‌ی ساعت/باتری آیفون (safe-area) با رنگ اصلی برند */}
        <div className="pwa-status-bar" aria-hidden="true" />
        {/* رپر PWA برای مدیریت آفلاین و نصب */}
        <PWAProvider>{children}</PWAProvider>
        {/* چت آنلاین پشتیبانی (روشن/خاموش و همه‌ی تنظیمات از پنل مدیریت ← چت آنلاین) */}
        <LiveChatWidget />
      </body>
    </html>
  );
}