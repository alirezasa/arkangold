// admin/app/api/admin-auth/login/route.ts
import { NextResponse } from "next/server";
import axios from "axios";

// NEST_API_URL آدرس پایه‌ی API است (مثل سایر routeها)؛ مسیر /admin-auth اینجا اضافه می‌شود
const NEST_API_URL = `${
  process.env.NEST_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://api.arkan.gold"
    : "http://localhost:5000")
}/admin-auth`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await axios.post(`${NEST_API_URL}/login`, body);
    const { accessToken, refreshToken, admin, expiresIn, refreshExpiresIn } =
      response.data;

    const res = NextResponse.json({ success: true, admin });

    res.cookies.set("adminAccessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      // عمر نشست از تنظیمات سیستم (session.admin.timeout_minutes)
      maxAge: Number(expiresIn) || 30 * 60,
      path: "/",
    });
    res.cookies.set("adminRefreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: Number(refreshExpiresIn) || 24 * 60 * 60,
      path: "/",
    });

    return res;
  } catch (error: unknown) {
    let status = 500;
    let message = "خطایی در سرور رخ داد";
    if (axios.isAxiosError(error)) {
      status = error.response?.status || 500;
      const data = error.response?.data as { message?: string } | undefined;
      message = data?.message || error.message || message;
    }
    return NextResponse.json({ message }, { status });
  }
}
