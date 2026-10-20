// صفحه‌ی عمومی استعلام فاکتور/پیش‌فاکتور (لینک QR چاپ‌شده روی سند)
import type { Metadata } from "next";
import "../dashboard/components/documents/document.css";

export const metadata: Metadata = {
  title: "استعلام فاکتور | آرکان گلد",
  robots: { index: false, follow: false },
};

export default function VerifyInvoiceLayout({ children }: { children: React.ReactNode }) {
  return <div dir="rtl">{children}</div>;
}
