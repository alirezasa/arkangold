// admin/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AGENT_PORTAL_PATHS, PORTAL_HOME, portalFromHeaders } from "./lib/portal";

const PUBLIC_PATHS = ["/login"];

/** فایل‌های ایستا (manifest.json، sw.js، فونت‌ها و ...) مشمول هدایت بین پنل‌ها نمی‌شوند */
const isStaticFile = (pathname: string) => /\.[a-z0-9]+$/i.test(pathname);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("adminAccessToken")?.value;
  // admin.arkan.gold → پنل مدیریت، panel.arkan.gold → پنل نمایندگان
  const portal = portalFromHeaders(request.headers);
  const home = PORTAL_HOME[portal];

  // فایل‌های ایستای public (manifest.json، sw.js، آیکون‌ها، robots.txt) و لوگوی پویا (/brand/logo) نیاز به ورود ندارند؛
  // قبلاً بدون کوکی به /login هدایت می‌شدند و مرورگر HTML صفحه‌ی ورود را به‌جای manifest
  // می‌خواند («Manifest: Line: 1, column: 1, Syntax error»).
  if (isStaticFile(pathname) || pathname.startsWith("/brand/")) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    if (token) return NextResponse.redirect(new URL(home, request.url));
    return NextResponse.next();
  }

  if (!token) {
    const res = NextResponse.redirect(new URL("/login", request.url));
    // FDP_RIP_EXT.1.1 — نشست به‌طور ضمنی (انقضا) پایان یافته: باقی‌مانده‌ی آن در مرورگر پاک می‌شود
    if (request.cookies.has("adminRefreshToken")) {
      res.cookies.delete("adminRefreshToken");
      res.headers.set("Clear-Site-Data", '"cache", "storage"');
    }
    return res;
  }

  if (portal === "agent") {
    // پنل نمایندگان فقط پرتال نمایندگی، اسناد و پروفایل را دارد
    const allowed = AGENT_PORTAL_PATHS.some((p) => pathname.startsWith(p));
    if (!allowed) return NextResponse.redirect(new URL(home, request.url));
  } else if (pathname.startsWith("/agent-portal")) {
    // پرتال نمایندگی فقط از دامنه‌ی پنل نمایندگان
    return NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  // مهم: مسیرهای /api باید مستثنی شوند چون route handlerها خودشان
  // کوکی را از cookies() می‌خوانند و بررسی مجدد در middleware باعث
  // بلاک‌شدن درخواست‌های POST به این مسیرها (مثل خودِ لاگین) می‌شود
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
