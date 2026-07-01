// app/app/api/market/price/route.ts
import { NextResponse } from "next/server";
import axios from "axios";
const NEST = "http://localhost:5000";

export async function GET() {
  try {
    const res = await axios.get(`${NEST}/market/price`);
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
