// app/app/api/market/price/history/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
const NEST = "http://localhost:5000";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const hours = searchParams.get("hours") ?? "24";
    const res = await axios.get(`${NEST}/market/price/history?hours=${hours}`);
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
