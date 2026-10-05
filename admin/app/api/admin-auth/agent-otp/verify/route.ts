// admin/app/api/admin-auth/agent-otp/verify/route.ts
// تأیید کد ورود نماینده (عامل اول) — فقط در دامنه‌ی پنل نمایندگان
import { NextResponse } from "next/server";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { errorResponse, loginStepOrSession } from "@/app/lib/adminSession";
import { portalFromHeaders } from "@/lib/portal";

export async function POST(request: Request) {
  if (portalFromHeaders(request.headers) !== "agent") {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }
  try {
    const body = (await request.json()) as { phone?: unknown; code?: unknown };
    const response = await axios.post(`${NEST}/admin-auth/agent-otp/verify`, {
      phone: body.phone,
      code: body.code,
    });
    // کد پیامکی فقط عامل اول است؛ پاسخ مرحله‌ی برنامه‌ی احراز هویت است (FIA_UAU_EXT.2.3)
    return loginStepOrSession(response.data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
