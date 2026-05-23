import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css'; // استایل‌های سراسری و تیلویند

// تنظیم فونت محلی (آدرس‌ها را بر اساس نام فایل‌های فونت خود تنظیم کنید)
// اگر فعلا فونت ندارید، می‌توانید این بخش را کامنت کنید
const yekanBakh = localFont({
  src: [
    {
      path: '../public/fonts/iransansx-thin.woff2'
    
    },
    {
      path: '../public/fonts/iransansx-thin.woff2'
     
    },
  ],
  variable: '--font-yekan',
});

export const metadata: Metadata = {
  title: 'آرگان گلد | خرید و فروش طلای آب شده',
  description: 'وب اپلیکیشن خرید و فروش طلای آب شده',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // تنظیم زبان فارسی و راست‌چین
    <html lang="fa" dir="rtl">
      <body className={`${yekanBakh.variable} font-sans bg-gray-100 min-h-screen`}>
        {/* کانتینر اصلی برای حالت PWA (محدود کردن عرض در دسکتاپ) */}
        <main className="max-w-md mx-auto bg-white min-h-screen shadow-lg relative overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
