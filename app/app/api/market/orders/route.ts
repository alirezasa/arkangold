// app/app/api/market/orders/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";

// POST: ثبت سفارش
export async function POST(req: Request) {
  try {
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const res = await axios.post(`${NEST}/market/orders`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const d = e.response?.data as { message?: string | string[] } | undefined;
      const msg = Array.isArray(d?.message)
        ? d.message[0]
        : d?.message || "خطا";
      return NextResponse.json(
        { message: msg },
        { status: e.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}

// GET: تاریخچه سفارشات
export async function GET(req: Request) {
  try {
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const page = searchParams.get("page") ?? "1";
    const limit = searchParams.get("limit") ?? "20";
    const res = await axios.get(
      `${NEST}/market/orders?page=${page}&limit=${limit}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
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
