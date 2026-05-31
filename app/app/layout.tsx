// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Vazirmatn } from "next/font/google";
import PWAProvider from "./dashboard/components/PWAProvider"; // مسیر دقیق را چک کنید
import "./globals.css";

// تنظیمات فونت
const vazir = Vazirmatn({ subsets: ["arabic"], variable: "--font-vazir" });

// تنظیمات PWA و متادیتا
export const metadata: Metadata = {
  title: "آرکان گلد | پلتفرم طلای آب‌شده",
  description: "خرید و فروش امن طلای آب‌شده",
  manifest: "/manifest.json", // بسیار مهم برای PWA
};

// تنظیمات Viewport برای جلوگیری از زوم شدن در موبایل (الزام PWA)
export const viewport: Viewport = {
  themeColor: "#064e3b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fa" dir="rtl" className={vazir.className}>
      <head>
        {/* اضافه کردن کتابخانه Tabler Icons برای آیکون‌ها */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css"
        />
      </head>
      <body>
        {/* رپر PWA برای نمایش بنرهای نصب آفلاین و iOS */}
        <PWAProvider>{children}</PWAProvider>
      </body>
    </html>
  );
}