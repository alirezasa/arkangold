// app/app/api/auth/logout/route.ts
//
// خروج واقعی: ابتدا نشست در سرور باطل می‌شود (تا توکن سرقت‌شده هم بی‌اثر شود)،
// سپس همه‌ی داده‌های نشست در مرورگر پاک می‌شوند. خطای سرور (مثلاً نشست از قبل منقضی)
// مانع خروج نمی‌شود.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { NEST_AUTH_URL, clearSessionCookies } from "../_session";

export async function POST() {
  const token = (await cookies()).get("accessToken")?.value;
  if (token) {
    await axios
      .post(`${NEST_AUTH_URL}/logout`, null, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000,
      })
      .catch(() => undefined);
  }
  return clearSessionCookies(
    NextResponse.json({ success: true, message: "با موفقیت خارج شدید" }),
  );
}
