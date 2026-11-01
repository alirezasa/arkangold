import { NextResponse } from "next/server";
import axios from "axios";
import { NEST, errorResponse, getAccessToken } from "../../../_lib/proxy";
import { setSessionCookies, type SessionTokens } from "../../_session";

// مدیریت ورود دومرحله‌ای: راه‌اندازی، تأیید، غیرفعال‌سازی و کدهای بازیابی
const ALLOWED = new Set(["setup", "setup/confirm", "disable", "recovery-codes"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string[] }> },
) {
  const action = (await params).action.join("/");
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ message: "مسیر نامعتبر" }, { status: 404 });
  }
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const { data } = await axios.post(`${NEST}/auth/mfa/${action}`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // FTA_TSE_EXT.3.3 / 1.4 — پس از تغییر عامل، نشست‌های دیگر بسته و نشست این دستگاه با شناسه‌ی
    // جدید جایگزین می‌شود؛ توکن‌ها فقط در کوکی HttpOnly قرار می‌گیرند و به مرورگر برنمی‌گردند
    const { session, ...rest } = (data ?? {}) as { session?: SessionTokens | null } & Record<string, unknown>;
    const res = NextResponse.json(rest);
    if (session?.accessToken) setSessionCookies(res, session);
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
