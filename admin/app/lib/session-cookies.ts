// admin/app/lib/session-cookies.ts
// FDP_RIP_EXT.1.1 — پاک‌سازی کامل نشست ادمین در مرورگر: حذف کوکی‌ها و سرآیند Clear-Site-Data
// (حافظه‌ی نهان، کوکی‌ها و فضای ذخیره‌سازی همین مبدأ).
import type { NextResponse } from "next/server";

export function clearAdminSessionCookies(res: NextResponse) {
  res.cookies.delete("adminAccessToken");
  res.cookies.delete("adminRefreshToken");
  res.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  res.headers.set("Cache-Control", "no-store");
  return res;
}
