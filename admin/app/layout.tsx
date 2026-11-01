// admin/app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { PORTAL_LABEL, portalFromHeaders } from "@/lib/portal";
import "./globals.css";
import SensitiveQueryGuard from "./components/SensitiveQueryGuard";
import { NEST } from "./lib/adminProxy";
import { DEFAULT_THEME_COLOR, fetchTheme } from "./lib/theme";
import { ThemeSync } from "./components/theme/ThemeMode";
import { THEME_INIT_SCRIPT } from "./components/theme/theme-mode";

const dana = localFont({
  src: [
    {
      path: "../public/fonts/DanaFaNum-Regular.woff",
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

// عنوان بر اساس دامنه: admin.arkan.gold → پنل مدیریت، panel.arkan.gold → پنل نمایندگان
export async function generateMetadata(): Promise<Metadata> {
  const label = PORTAL_LABEL[portalFromHeaders(await headers())];
  return {
    title: `${label} | آرکان گلد`,
    description: `${label} پلتفرم آرکان گلد`,
    manifest: "/manifest.json",
    // پنل‌های مدیریت/نمایندگان در نتایج جستجو نمایش داده نمی‌شوند (به‌همراه X-Robots-Tag و robots.txt)
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
  };
}

// رنگ نوار مرورگر موبایل از رنگ اصلی تنظیم‌شده در «ظاهر، رنگ و فونت»
export async function generateViewport(): Promise<Viewport> {
  const theme = await fetchTheme(NEST);
  return {
    themeColor: theme?.themeColor ?? DEFAULT_THEME_COLOR,
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
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
    // suppressHydrationWarning: کلاس dark پیش از hydration با اسکریپت head افزوده می‌شود
    <html lang="fa" dir="rtl" className={`${dana.variable} font-sans`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {theme && <style id="arkan-theme" dangerouslySetInnerHTML={{ __html: theme.css }} />}
      </head>
      <body className="antialiased bg-gray-50 text-gray-900 overscroll-none">
        <ThemeSync />
        <SensitiveQueryGuard />
        {children}
      </body>
    </html>
  );
}
