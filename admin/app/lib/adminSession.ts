// admin/app/lib/adminSession.ts
//
// ثبت کوکی‌های نشست ادمین/نماینده پس از ورود (رمز عبور یا کد یکبارمصرف).
// کوکی‌ها بدون Domain ثبت می‌شوند تا نشست admin.arkan.gold و panel.arkan.gold از هم جدا بماند.
import { NextResponse } from "next/server";
import axios from "axios";

export interface NestLoginResponse {
  accessToken: string;
  refreshToken: string;
  admin: unknown;
  expiresIn?: number;
  refreshExpiresIn?: number;
}

export function sessionResponse(data: NestLoginResponse) {
  const res = NextResponse.json({ success: true, admin: data.admin });
  res.cookies.set("adminAccessToken", data.accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    // عمر نشست از تنظیمات سیستم (session.admin.timeout_minutes)
    maxAge: Number(data.expiresIn) || 30 * 60,
    path: "/",
  });
  res.cookies.set("adminRefreshToken", data.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: Number(data.refreshExpiresIn) || 24 * 60 * 60,
    path: "/",
  });
  return res;
}

export function errorResponse(error: unknown) {
  let status = 500;
  let message = "خطایی در سرور رخ داد";
  if (axios.isAxiosError(error)) {
    status = error.response?.status || 500;
    const data = error.response?.data as { message?: string | string[] } | undefined;
    const m = Array.isArray(data?.message) ? data?.message[0] : data?.message;
    message = m || error.message || message;
  }
  return NextResponse.json({ message }, { status });
}
