// app/app/api/auth/_session.ts
// کمکی‌های مشترک BFF احراز هویت: ست کردن کوکی‌های HttpOnly نشست و عبور دادن خطاهای API
// همراه کد (مثل CAPTCHA_REQUIRED یا LOGIN_THROTTLED) تا کلاینت بتواند واکنش درست نشان دهد.
import { NextResponse } from "next/server";
import axios from "axios";

export const NEST_AUTH_URL = `${
  process.env.NEST_API_URL ||
  (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000")
}/auth`;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  refreshExpiresIn?: number;
}

export function setSessionCookies(res: NextResponse, t: SessionTokens) {
  res.cookies.set("accessToken", t.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    // عمر نشست از تنظیمات پنل ادمین (session.user.timeout_minutes)
    maxAge: Number(t.expiresIn) || 15 * 60,
    path: "/",
  });
  res.cookies.set("refreshToken", t.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: Number(t.refreshExpiresIn) || 7 * 24 * 60 * 60,
    path: "/",
  });
  return res;
}

export function authErrorResponse(error: unknown) {
  if (axios.isAxiosError(error) && error.response) {
    const data = (error.response.data ?? {}) as {
      message?: string | string[];
      code?: string;
      retryAfter?: number;
    };
    return NextResponse.json(
      {
        message: data.message || "خطایی در سرور رخ داد",
        code: data.code,
        retryAfter: data.retryAfter,
      },
      { status: error.response.status },
    );
  }
  console.error("BFF auth error:", error);
  return NextResponse.json({ message: "خطایی در سرور رخ داد" }, { status: 500 });
}

// FDP_RIP_EXT.1.1 — پاک‌سازی کامل داده‌های نشست در مرورگر پس از خروج/انقضا:
// کوکی‌های نشست حذف می‌شوند و با سرآیند Clear-Site-Data مرورگر حافظه‌ی نهان، کوکی‌ها و
// فضای ذخیره‌سازی (localStorage/sessionStorage/IndexedDB) همین مبدأ را پاک می‌کند.
// پاک‌سازی سمت کلاینت (lib/session-cleanup) در صورت در دسترس نبودن سرور هم اجرا می‌شود.
export function clearSessionCookies(res: NextResponse) {
  res.cookies.delete("accessToken");
  res.cookies.delete("refreshToken");
  res.headers.set("Clear-Site-Data", '"cache", "cookies", "storage"');
  res.headers.set("Cache-Control", "no-store");
  return res;
}
