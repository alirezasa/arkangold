// app/app/dashboard/trade/page.tsx
//
// صفحه‌ی جداگانه‌ی خرید/فروش حذف شد؛ خرید و فروش مستقیم در صفحه‌ی طلای آب‌شده انجام
// می‌شود. این مسیر فقط برای سازگاری با لینک‌ها/بوکمارک‌ها و میان‌بر PWA قدیمی باقی مانده.
import { redirect } from "next/navigation";

export default async function TradeRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ side?: string; action?: string }>;
}) {
  const { side, action } = await searchParams;
  const wanted = (side ?? action ?? "").toLowerCase();
  redirect(wanted === "sell" ? "/dashboard/melted-gold?side=sell" : "/dashboard/melted-gold");
}
