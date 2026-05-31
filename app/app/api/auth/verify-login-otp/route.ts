import { NextResponse } from "next/server";
import axios from "axios";

const NEST_API_URL = process.env.NEST_API_URL || "http://localhost:5000/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // ارسال اطلاعات به بک‌اند اصلی (NestJS)
    const response = await axios.post(`${NEST_API_URL}/verify-login-otp`, body);
    const { accessToken, refreshToken, user } = response.data;

    const nextResponse = NextResponse.json({ success: true, user });

    // ست کردن اکسس توکن به صورت کوکی امن HttpOnly
    nextResponse.cookies.set("accessToken", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60, // ۱۵ دقیقه
      path: "/",
    });

    // ست کردن رفرش توکن به صورت کوکی امن HttpOnly
    nextResponse.cookies.set("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60, // ۷ روز
      path: "/",
    });

    return nextResponse;
  } catch (error: unknown) {
    console.error("بخش سروری BFF با این خطا مواجه شد:", error);
    let status = 500;
    let message = "خطایی در سرور رخ داد";

    // بررسی امن نوع خطا برای فرار از قانون explicit-any در ESLint
    if (axios.isAxiosError(error)) {
      status = error.response?.status || 500;

      // فرض بر این است که ساختار خطای NestJS شامل شیء یا رشته پیام است
      const errorData = error.response?.data as
        | { message?: string }
        | undefined;
      message = errorData?.message || error.message || message;
    } else if (error instanceof Error) {
      message = error.message;
    }

    return NextResponse.json({ message }, { status });
  }
}
