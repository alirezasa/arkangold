// admin/app/api/admin/users/[id]/identity/reinquire/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

// استعلام مجدد اطلاعات هویتی کاربر از ثبت احوال
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = (await cookies()).get("adminAccessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const res = await axios.post(
      `${NEST}/admin/users/${id}/identity/reinquire`,
      {},
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const data = e.response?.data as
        | { message?: string | string[] }
        | undefined;
      const message = Array.isArray(data?.message)
        ? data.message[0]
        : data?.message || "خطا در استعلام هویت";
      return NextResponse.json(
        { message },
        { status: e.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
