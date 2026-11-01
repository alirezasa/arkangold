// admin/app/lib/session-cookies.ts
// FDP_RIP_EXT.1.1 — پاک‌سازی کامل نشست ادمین در مرورگر: حذف کوکی‌ها و سرآیند Clear-Site-Data
// (حافظه‌ی نهان، کوکی‌ها و فضای ذخیره‌سازی همین مبدأ).
import type { NextResponse } from "next/server";
import { ADMIN_ACCESS_COOKIE, ADMIN_REFRESH_COOKIE } from "@/lib/cookie-names";

export function clearAdminSessionCookies(res: NextResponse) {
  res.cookies.delete(ADMIN_ACCESS_COOKIE);
  res.cookies.delete(ADMIN_REFRESH_COOKIE);
  res.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  res.headers.set("Cache-Control", "no-store");
  return res;
}
