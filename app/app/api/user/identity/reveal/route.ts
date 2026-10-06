// FDP_ACC_EXT.1.5 — نمایش کامل کد ملی و تاریخ تولد فقط با درخواست صریح کاربر (دکمه‌ی «نمایش»)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";

const NEST_API_URL = process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export async function POST() {
  const token = (await cookies()).get("accessToken")?.value;
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const res = await axios.post(`${NEST_API_URL}/users/me/identity/reveal`, null, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { message: error.response?.data?.message || "خطا در دریافت اطلاعات" },
        { status: error.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
