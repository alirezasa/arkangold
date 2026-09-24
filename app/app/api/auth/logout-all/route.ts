import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

// خروج از همه دستگاه‌ها: باطل کردن همه نشست‌ها در بک‌اند و پاک کردن کوکی فعلی
export async function POST() {
  const token = (await cookies()).get("accessToken")?.value;
  if (!token)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const res = await axios.post(
      `${NEST}/auth/logout-all`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const response = NextResponse.json(res.data);
    response.cookies.delete("accessToken");
    return response;
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json(
        { message: e.response?.data?.message || "خطا" },
        { status: e.response?.status || 500 },
      );
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
