// admin/app/invoices/[id]/layout.tsx
//
// عمداً خارج از (dashboard) است — layout داشبورد شامل سایدبار است
// که چاپ سند را خراب می‌کند.

import type { Metadata } from "next";
import "../components/document.css";

export const metadata: Metadata = {
  title: "سند مالی | پنل ادمین آرکان گلد",
  robots: { index: false, follow: false },
};

export default function AdminInvoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div dir="rtl">{children}</div>;
}
