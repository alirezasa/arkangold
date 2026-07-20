// admin/app/layout.tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "پنل مدیریت | آرکان گلد",
  description: "پنل مدیریت پلتفرم آرکان گلد",
  manifest: "/manifest.json",
};

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
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.44.0/tabler-icons.min.css"
        />
      </head>
      <body className="antialiased bg-gray-50 text-gray-900 overscroll-none">
        {children}
      </body>
    </html>
  );
}
