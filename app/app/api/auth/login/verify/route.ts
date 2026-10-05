import { NextResponse } from "next/server";
import axios from "axios";
import { NEST_AUTH_URL, authErrorResponse, setSessionCookies } from "../../_session";

// مرحله‌ی دوم ورود: کد پیامکی، کد برنامه‌ی احراز هویت یا کد بازیابی → نشست در کوکی HttpOnly
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data } = await axios.post(`${NEST_AUTH_URL}/login/verify`, body);
    return setSessionCookies(NextResponse.json({ success: true, user: data.user }), data);
  } catch (error) {
    return authErrorResponse(error);
  }
}
