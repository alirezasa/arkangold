import { NextResponse } from "next/server";
import axios from "axios";
import { NEST_AUTH_URL, authErrorResponse } from "../../_session";

// ورود با کد پیامکی: درخواست ارسال کد. پاسخ فقط توکن مرحله است؛ نشست پس از تأیید کد
// در /api/auth/login/verify صادر و کوکی ست می‌شود.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data } = await axios.post(`${NEST_AUTH_URL}/login/otp`, {
      phone: body?.phone,
      captcha: body?.captcha,
    });
    return NextResponse.json(data);
  } catch (error) {
    return authErrorResponse(error);
  }
}
