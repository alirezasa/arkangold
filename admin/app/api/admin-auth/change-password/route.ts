// admin/app/api/admin-auth/change-password/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";

export async function POST(req: Request) {
  try {
    const token = (await cookies()).get("adminAccessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const res = await axios.post(`${NEST}/admin-auth/change-password`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // چون بک‌اند همه‌ی نشست‌ها را باطل می‌کند، کوکی‌های محلی را هم پاک می‌کنیم
    const nextRes = NextResponse.json(res.data);
    nextRes.cookies.delete("adminAccessToken");
    nextRes.cookies.delete("adminRefreshToken");
    return nextRes;
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const data = e.response?.data as
        | { message?: string | string[] }
        | undefined;
      const message = Array.isArray(data?.message)
        ? data.message[0]
        : data?.message || "خطا";
      return NextResponse.json(
        { message },
        { status: e.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
