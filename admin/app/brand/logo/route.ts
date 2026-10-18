// admin/app/brand/logo/route.ts
//
// لوگوی پویا (قابل تغییر از پنل مدیریت ← تنظیمات سیستم ← لوگو، مهر و امضا) از همین مبدأ؛
// اگر لوگویی بارگذاری نشده یا API در دسترس نباشد، لوگوی پیش‌فرض /logo.png نمایش داده می‌شود.
import { NEST } from "@/app/lib/adminProxy";

export const revalidate = 300;

export async function GET() {
  try {
    const res = await fetch(`${NEST}/public/branding/logo`, {
      next: { revalidate: 300 },
    });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (res.ok && /^image\/(png|jpeg|webp)$/.test(type)) {
      return new Response(await res.arrayBuffer(), {
        headers: {
          "Content-Type": type,
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch {
    // API در دسترس نیست → لوگوی پیش‌فرض
  }
  // Location نسبی تا پشت پراکسی به نشانی داخلی سرور هدایت نشود
  return new Response(null, { status: 302, headers: { Location: "/logo.png" } });
}
