// چالش «بررسی امنیتی» (Proof-of-Work) برای فرم‌های ورود — بدون سرویس خارجی
import { NextResponse } from "next/server";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { errorResponse } from "@/app/lib/adminSession";

export async function GET() {
  try {
    const { data } = await axios.get(`${NEST}/auth-security/challenge`);
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
