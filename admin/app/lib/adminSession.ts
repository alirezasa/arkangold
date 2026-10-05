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
  /** فقط در پایان راه‌اندازی برنامه‌ی احراز هویت (یک‌بار نمایش) */
  recoveryCodes?: string[];
}

/** پاسخ مرحله‌ای ورود (هنوز نشستی وجود ندارد): CHANGE_PASSWORD / MFA_SETUP / MFA_VERIFY */
export interface NestLoginStep {
  next: "CHANGE_PASSWORD" | "MFA_SETUP" | "MFA_VERIFY";
  challengeToken: string;
  minPasswordLength?: number;
  message?: string;
}

/**
 * FIA_UAU_EXT.2.3: کوکی نشست فقط وقتی ست می‌شود که API واقعاً توکن صادر کرده باشد (پس از همه‌ی
 * مراحل ورود)؛ پاسخ‌های مرحله‌ای بدون تغییر به کلاینت می‌رسند.
 */
export function loginStepOrSession(data: NestLoginResponse | NestLoginStep) {
  if ("accessToken" in data && data.accessToken) return sessionResponse(data);
  return NextResponse.json(data);
}

export function sessionResponse(data: NestLoginResponse) {
  const res = NextResponse.json({
    success: true,
    admin: data.admin,
    ...(data.recoveryCodes ? { recoveryCodes: data.recoveryCodes } : {}),
  });
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
  let code: string | undefined;
  let retryAfter: number | undefined;
  if (axios.isAxiosError(error)) {
    status = error.response?.status || 500;
    const data = error.response?.data as
      | { message?: string | string[]; code?: string; retryAfter?: number }
      | undefined;
    const m = Array.isArray(data?.message) ? data?.message[0] : data?.message;
    message = m || error.message || message;
    // کد خطا (مثل CAPTCHA_REQUIRED یا LOGIN_THROTTLED) برای واکنش درست کلاینت
    code = data?.code;
    retryAfter = data?.retryAfter;
  }
  return NextResponse.json({ message, code, retryAfter }, { status });
}
