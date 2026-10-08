// admin/app/labels/layout.tsx
//
// عمداً خارج از (dashboard) است — سایدبار و هدر داشبورد نباید روی برچسب چاپ شوند.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "چاپ برچسب | پنل ادمین آرکان گلد",
  robots: { index: false, follow: false },
};

export default function LabelsLayout({ children }: { children: React.ReactNode }) {
  return <div dir="rtl">{children}</div>;
}
