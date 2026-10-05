import { NextResponse } from "next/server";
import axios from "axios";
import { NEST_AUTH_URL, authErrorResponse } from "../_session";

// مرحله‌ی اول ورود (رمز عبور). FIA_UAU_EXT.2.3: پاسخ هنوز نشست نیست؛ فقط توکن مرحله و روش
// عامل دوم (پیامک یا برنامه‌ی احراز هویت) برگردانده می‌شود و هیچ کوکی‌ای ست نمی‌شود.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data } = await axios.post(`${NEST_AUTH_URL}/login`, body);
    return NextResponse.json(data);
  } catch (error) {
    return authErrorResponse(error);
  }
}
