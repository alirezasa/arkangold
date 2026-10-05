import { NextResponse } from "next/server";
import { adminProxy } from "@/app/lib/adminProxy";

// کدهای بازیابی جدید و جایگزینی برنامه‌ی احراز هویت (گوشی جدید) — نیازمند کد فعلی
const ALLOWED = new Set(["recovery-codes", "reconfigure", "reconfigure/confirm"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string[] }> },
) {
  const action = (await params).action.join("/");
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }
  const body = await request.json().catch(() => ({}));
  return adminProxy(`/admin-auth/mfa/${action}`, { method: "POST", data: body });
}
