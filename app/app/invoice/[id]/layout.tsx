// app/app/invoice/[id]/layout.tsx
//
// ⚠ عمداً خارج از app/dashboard است.
// layout داشبورد شامل گیت onboarding حقوقی، سایدبار و نویگیشن پایین است
// که هم چاپ را خراب می‌کند هم ممکن است کاربر را redirect کند.

import type { Metadata } from "next";
import "../../dashboard/components/documents/document.css";

export const metadata: Metadata = {
  title: "سند مالی | آرکان گلد",
  robots: { index: false, follow: false },
};

export default function InvoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div dir="rtl">{children}</div>;
}
