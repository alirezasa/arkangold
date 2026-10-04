// app/app/api/public/delivery/[token]/confirm/route.ts
// ثبت تحویل توسط پیک با کد تحویل مشتری — عمومی و بدون نیاز به ورود
import { NextResponse } from "next/server";
import axios from "axios";

const NEST = process.env.NEST_ORIGIN || process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const body = (await req.json()) as unknown;
    const res = await axios.post(`${NEST}/public/delivery/${encodeURIComponent(token)}/confirm`, body);
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
