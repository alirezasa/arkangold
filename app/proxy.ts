import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { RETURN_PATH_PARAM, sanitizeReturnPath } from "./app/utils/return-path";
import { ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_SESSION_COOKIES } from "@/lib/cookie-names";

/**
 * FMT_CFG_EXT.2.1 — مسیرهای نقطه‌دار (.git، .env، .svn، .hg و ...) هرگز ارائه نمی‌شوند و حتی به
 * صفحه‌ی ورود هم هدایت نمی‌شوند (پاسخ 404 یکسان)؛ فقط /.well-known استاندارد مستثناست.
 */
const isDotPath = (pathname: string) =>
  pathname
    .split("/")
    .some((seg) => seg.startsWith(".") && seg !== ".well-known");
const notFound = () => new NextResponse("Not Found", { status: 404 });


export function proxy(request: NextRequest) {
  if (isDotPath(request.nextUrl.pathname)) return notFound();
  // FMT_CFG_EXT.4.1 — کوکی‌های قدیمی بدون پیشوند __Host- پس از استقرار پاک می‌شوند
  const legacy = LEGACY_SESSION_COOKIES.filter((n) => request.cookies.has(n));
  if (legacy.length) {
    const res = NextResponse.redirect(request.nextUrl);
    for (const n of legacy) res.cookies.delete(n);
    return res;
  }
  const token = request.cookies.get(ACCESS_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  // صفحه اصلی
  if (pathname === "/") {
    return token
      ? NextResponse.redirect(new URL("/dashboard", request.url))
      : NextResponse.redirect(new URL("/login", request.url));
  }

  // حفاظت از داشبورد و زیرمسیرها (شامل wallet)؛ مسیر درخواستی (مثلاً صفحه
  // شمشی که کاربر از سایت arkan.gold انتخاب کرده) در ?next= حفظ می‌شود تا پس از
  // ورود/ثبت‌نام و احراز هویت به همان صفحه برگردد
  if (pathname.startsWith("/dashboard")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      const next = sanitizeReturnPath(pathname + request.nextUrl.search);
      if (next) loginUrl.searchParams.set(RETURN_PATH_PARAM, next);
      const res = NextResponse.redirect(loginUrl);
      // FDP_RIP_EXT.1.1 — نشست به‌طور ضمنی (انقضا) پایان یافته: باقی‌مانده‌ی آن در مرورگر پاک می‌شود
      if (request.cookies.has(REFRESH_COOKIE)) {
        res.cookies.delete(REFRESH_COOKIE);
        res.headers.set("Clear-Site-Data", '"cache", "storage"');
      }
      return res;
    }
  }

  // جلوگیری از دسترسی کاربر لاگین‌شده به صفحات auth
  if (
    token &&
    (pathname.startsWith("/login") || pathname.startsWith("/register"))
  ) {
    const next = sanitizeReturnPath(
      request.nextUrl.searchParams.get(RETURN_PATH_PARAM),
    );
    return NextResponse.redirect(new URL(next ?? "/dashboard", request.url));
  }
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/",
    "/dashboard/:path*", // ← همه زیرمسیرهای dashboard از جمله wallet
    "/login",
    "/register",
    "/((?!api|_next/static|_next/image|favicon.ico|brand).*)",
  ],
};
