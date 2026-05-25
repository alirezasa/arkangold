// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "پلتفرم خرید و فروش طلا",
  description: "معاملات امن طلای آب شده",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl">
      {/* هیچ کلاس محدود کننده عرضی نباید اینجا باشد */}
      <body className="antialiased min-h-screen bg-white dark:bg-gray-900">
        {children}
      </body>
    </html>
  );
}