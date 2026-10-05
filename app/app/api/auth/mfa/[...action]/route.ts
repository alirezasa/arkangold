import { NextResponse } from "next/server";
import { proxy } from "../../../_lib/proxy";

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
  const body = await request.json().catch(() => ({}));
  return proxy(`/auth/mfa/${action}`, { method: "POST", data: body });
}
