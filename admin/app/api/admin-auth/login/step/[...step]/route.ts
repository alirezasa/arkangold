// admin/app/api/admin-auth/login/step/[...step]/route.ts
// مراحل بعدی ورود پنل: تغییر رمز موقت، راه‌اندازی/تأیید برنامه‌ی احراز هویت و بررسی کد.
// کوکی نشست فقط پس از مرحله‌ی آخر (وقتی API توکن صادر کند) ست می‌شود.
import { NextResponse } from "next/server";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { errorResponse, loginStepOrSession } from "@/app/lib/adminSession";

const STEPS = new Set(["change-password", "mfa-setup", "mfa-setup/confirm", "mfa"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ step: string[] }> },
) {
  const step = (await params).step.join("/");
  if (!STEPS.has(step)) {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const response = await axios.post(`${NEST}/admin-auth/login/${step}`, body);
    return loginStepOrSession(response.data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
