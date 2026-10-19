// app/app/brand/logo/route.ts
//
// لوگوی پویا (قابل تغییر از پنل مدیریت ← تنظیمات سیستم ← لوگو، مهر و امضا) از همین مبدأ؛
// اگر لوگویی بارگذاری نشده یا API در دسترس نباشد، لوگوی پیش‌فرض /logo.png نمایش داده می‌شود.
import { NEST } from "@/app/api/_lib/proxy";

// همیشه پویا: قبلاً با revalidate=300 در زمان build به‌صورت ایستا ساخته و تا چند دقیقه (و تا
// اولین درخواست پس از آن) لوگوی قبلی تحویل داده می‌شد؛ لوگوی تازه‌ی بارگذاری‌شده دیده نمی‌شد.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(`${NEST}/public/branding/logo`, { cache: "no-store" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (res.ok && /^image\/(png|jpeg|webp)$/.test(type)) {
      return new Response(await res.arrayBuffer(), {
        headers: {
          "Content-Type": type,
          // کش کوتاه مرورگر؛ تغییر لوگو حداکثر پس از یک دقیقه همه‌جا دیده می‌شود
          "Cache-Control": "public, max-age=60, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch {
    // API در دسترس نیست → لوگوی پیش‌فرض
  }
  // Location نسبی تا پشت پراکسی به نشانی داخلی سرور هدایت نشود
  return new Response(null, {
    status: 302,
    headers: { Location: "/logo.png", "Cache-Control": "no-store" },
  });
}
