import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { NEST_AUTH_URL, clearSessionCookies } from "../_session";

// خروج از همه دستگاه‌ها: باطل کردن همه نشست‌ها در بک‌اند و پاک‌سازی کامل نشست فعلی در مرورگر
export async function POST() {
  const token = (await cookies()).get("accessToken")?.value;
  if (!token)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const res = await axios.post(
      `${NEST_AUTH_URL}/logout-all`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return clearSessionCookies(NextResponse.json(res.data));
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json(
        { message: e.response?.data?.message || "خطا" },
        { status: e.response?.status || 500 },
      );
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
