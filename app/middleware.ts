import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { RETURN_PATH_PARAM, sanitizeReturnPath } from "./app/utils/return-path";

export function middleware(request: NextRequest) {
  const token = request.cookies.get("accessToken")?.value;
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
      if (request.cookies.has("refreshToken")) {
        res.cookies.delete("refreshToken");
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
