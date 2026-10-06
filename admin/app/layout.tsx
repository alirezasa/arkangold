// admin/app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { headers } from "next/headers";
import { PORTAL_LABEL, portalFromHeaders } from "@/lib/portal";
import "./globals.css";
import SensitiveQueryGuard from "./components/SensitiveQueryGuard";

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
  };
}

export const viewport: Viewport = {
  themeColor: "#330509",
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
    <html lang="fa" dir="rtl" className={`${dana.variable} font-sans`}>
      <body className="antialiased bg-gray-50 text-gray-900 overscroll-none">
        <SensitiveQueryGuard />
        {children}
      </body>
    </html>
  );
}
