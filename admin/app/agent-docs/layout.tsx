// admin/app/agent-docs/layout.tsx
//
// اسناد چاپی نمایندگان (حواله تحویل/عودت و صورتحساب) — خارج از layout داشبورد
// تا سایدبار در چاپ ظاهر نشود؛ همان قالب چاپی فاکتورها استفاده می‌شود.
import type { Metadata } from "next";
import "../invoices/components/document.css";

export const metadata: Metadata = {
  title: "سند نمایندگی | پنل آرکان گلد",
  robots: { index: false, follow: false },
};

export default function AgentDocsLayout({ children }: { children: React.ReactNode }) {
  return <div dir="rtl">{children}</div>;
}
