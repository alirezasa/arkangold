// admin/app/api/admin/users/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { ADMIN_ACCESS_COOKIE } from "@/lib/cookie-names";
import { adminProxy } from "@/app/lib/adminProxy";
const NEST = process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export async function GET(req: Request) {
  try {
    const token = (await cookies()).get(ADMIN_ACCESS_COOKIE)?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const res = await axios.get(`${NEST}/admin/users${qs ? `?${qs}` : ""}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json(
        { message: e.response?.data?.message || "خطا" },
        { status: e.response?.status || 500 },
      );
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}

// تعریف کاربر جدید از پنل (اختیاری: پیامک اطلاع‌رسانی به کاربر)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return adminProxy("/admin/users", { method: "POST", data: body });
}
