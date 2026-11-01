// admin/app/lib/theme.ts
//
// رنگ‌ها و فونت قابل تنظیم سیستم (پنل مدیریت ← ظاهر، رنگ و فونت). API یک CSS آماده (فقط متغیرهای
// رنگ با مقادیر hex اعتبارسنجی‌شده و @font-face) برمی‌گرداند که در <head> تزریق می‌شود؛ اگر API در
// دسترس نباشد، رنگ‌های پیش‌فرض globals.css (همان رنگ‌های فعلی برند) باقی می‌مانند.
// همین فایل با تغییر مسیر NEST در اپلیکیشن کاربران (app/app/lib/theme.ts) هم وجود دارد.

export const THEME_TAG = "arkan-theme";
export const DEFAULT_THEME_COLOR = "#330509";
export const DEFAULT_DARK_THEME_COLOR = "#22090d";

export interface PublicTheme {
  css: string;
  themeColor: string;
  darkThemeColor: string;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** هیچ‌گاه نباید CSS بتواند تگ style را ببندد (دفاع در عمق؛ API فقط hex و رشته‌ی ثابت می‌سازد) */
const safeCss = (css: string) => css.replace(/[<>]/g, "");

export function normalizeTheme(data: unknown): PublicTheme | null {
  const d = data as Partial<PublicTheme> | null;
  if (!d || typeof d.css !== "string") return null;
  return {
    css: safeCss(d.css),
    themeColor: typeof d.themeColor === "string" && HEX.test(d.themeColor) ? d.themeColor : DEFAULT_THEME_COLOR,
    darkThemeColor:
      typeof d.darkThemeColor === "string" && HEX.test(d.darkThemeColor) ? d.darkThemeColor : DEFAULT_DARK_THEME_COLOR,
  };
}

export async function fetchTheme(nest: string, fresh = false): Promise<PublicTheme | null> {
  try {
    const res = await fetch(`${nest}/public/branding/theme`, {
      ...(fresh ? { cache: "no-store" as const } : { next: { revalidate: 30, tags: [THEME_TAG] } }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return normalizeTheme(await res.json());
  } catch {
    return null;
  }
}

const FONT_TYPES = /^font\/(woff2?|ttf|otf)$/;

/** پروکسی فایل فونت سفارشی از API (همان مبدأ برای font-src 'self') */
export async function serveBrandFont(nest: string, slot: string): Promise<Response> {
  if (slot !== "regular" && slot !== "bold") return new Response("Not Found", { status: 404 });
  try {
    const res = await fetch(`${nest}/public/branding/font/${slot}`, { cache: "no-store" });
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
    if (res.ok && FONT_TYPES.test(type)) {
      return new Response(await res.arrayBuffer(), {
        headers: {
          "Content-Type": type,
          // نشانی فونت نسخه‌دار است (?v=...)؛ پس از تغییر فونت نشانی تازه ساخته می‌شود
          "Cache-Control": "public, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  } catch {
    // API در دسترس نیست → فونت پیش‌فرض (از پشته‌ی font-family)
  }
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}
