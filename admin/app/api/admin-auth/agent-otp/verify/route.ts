// admin/app/api/admin-auth/agent-otp/verify/route.ts
// تأیید کد ورود نماینده و ثبت نشست — فقط در دامنه‌ی پنل نمایندگان
import { NextResponse } from "next/server";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { errorResponse, sessionResponse } from "@/app/lib/adminSession";
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
    return sessionResponse(response.data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
