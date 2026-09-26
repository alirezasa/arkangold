// app/app/api/public/hologram/verify/route.ts
//
// نسخه عمومی و بدون‌نیاز-به-لاگین (بر خلاف _lib/proxy.ts که همیشه توکن می‌خواهد)
// — مستقیماً به POST /public/hologram/verify نست فوروارد می‌شود.
import { NextResponse } from "next/server";
import axios from "axios";

const NEST = process.env.NEST_ORIGIN || process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as unknown;
    const res = await axios.post(`${NEST}/public/hologram/verify`, body);
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const data = e.response?.data as { message?: string | string[] } | undefined;
      return NextResponse.json(
        { message: Array.isArray(data?.message) ? data.message[0] : data?.message ?? "خطا" },
        { status: e.response?.status ?? 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
