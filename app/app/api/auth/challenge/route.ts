import { NextResponse } from "next/server";
import axios from "axios";
import { authErrorResponse } from "../_session";

const NEST =
  process.env.NEST_API_URL ||
  (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

// چالش «بررسی امنیتی» (Proof-of-Work) — بدون سرویس خارجی
export async function GET() {
  try {
    const { data } = await axios.get(`${NEST}/auth-security/challenge`);
    return NextResponse.json(data, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
