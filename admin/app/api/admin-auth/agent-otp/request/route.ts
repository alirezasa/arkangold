// admin/app/api/admin-auth/agent-otp/request/route.ts
// درخواست کد ورود نماینده — فقط در دامنه‌ی پنل نمایندگان
import { NextResponse } from "next/server";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { errorResponse } from "@/app/lib/adminSession";
import { portalFromHeaders } from "@/lib/portal";

export async function POST(request: Request) {
  if (portalFromHeaders(request.headers) !== "agent") {
    return NextResponse.json({ message: "Not Found" }, { status: 404 });
  }
  try {
    const body = (await request.json()) as { phone?: unknown };
    const response = await axios.post(`${NEST}/admin-auth/agent-otp/request`, {
      phone: body.phone,
    });
    return NextResponse.json(response.data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
