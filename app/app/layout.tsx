import type { Metadata, Viewport } from "next";
import localFont from "next/font/local"; // ۱. تغییر ایمپورت به local
import PWAProvider from "./dashboard/components/PWAProvider"; 
import "./globals.css";


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

// تنظیمات PWA و متادیتا (بدون تغییر)
export const metadata: Metadata = {
  title: "آرکان گلد | پلتفرم طلای آب‌شده",
  description: "خرید و فروش امن طلای آب‌شده",
  manifest: "/manifest.json", 
};

// تنظیمات Viewport (بدون تغییر)
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
    // ۳. تزریق متغیر دانا و اعمال کلاس font-sans پیش‌فرض تلوند روی کل پروژه
    <html lang="fa" dir="rtl" className={`${dana.variable} font-sans`}>
      <head>
        {/* کتابخانه Tabler Icons */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css"
        />
      </head>
      <body className="antialiased bg-gray-50 text-gray-900">
        {/* رپر PWA برای مدیریت آفلاین و نصب */}
        <PWAProvider>{children}</PWAProvider>
      </body>
    </html>
  );
}