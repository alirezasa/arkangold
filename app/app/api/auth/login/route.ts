import { NextResponse } from "next/server";
import axios from "axios";
import { NEST_AUTH_URL, authErrorResponse, setSessionCookies } from "../_session";

// مرحله‌ی اول ورود (رمز عبور). معمولاً پاسخ هنوز نشست نیست و فقط توکن مرحله و روش عامل دوم
// (پیامک یا برنامه‌ی احراز هویت) برمی‌گردد. اگر ارسال کد پیامکی پس از رمز از پنل خاموش باشد
// (security.login.user_password_sms_code_enabled)، API نشست را مستقیم صادر می‌کند و کوکی ست می‌شود.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data } = await axios.post(`${NEST_AUTH_URL}/login`, body);
    if (data?.mfaRequired) return NextResponse.json(data);
    if (data?.accessToken) {
      return setSessionCookies(NextResponse.json({ success: true, user: data.user }), data);
    }
    return NextResponse.json(data);
  } catch (error) {
    return authErrorResponse(error);
  }
}
