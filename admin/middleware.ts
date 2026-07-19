// admin/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("adminAccessToken")?.value;

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic) {
    if (token) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // مهم: مسیرهای /api باید مستثنی شوند چون route handlerها خودشان
  // کوکی را از cookies() می‌خوانند و بررسی مجدد در middleware باعث
  // بلاک‌شدن درخواست‌های POST به این مسیرها (مثل خودِ لاگین) می‌شود
  matcher: ["/((?!_next|api|favicon.ico).*)"],
};
