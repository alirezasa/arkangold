// admin/app/api/admin-auth/session/unlock/route.ts
// بازگشایی نشست قفل‌شده با رمز عبور؛ رمز نادرست → API نشست را باطل می‌کند و این‌جا کوکی‌ها پاک می‌شوند
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { clearAdminSessionCookies } from "@/app/lib/session-cookies";

export async function POST(req: Request) {
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized", code: "SESSION_TERMINATED" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { password?: unknown };
  try {
    const { data } = await axios.post(
      `${NEST}/admin-auth/session/unlock`,
      { password: typeof body.password === "string" ? body.password : "" },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return NextResponse.json(data);
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const data = e.response?.data as { message?: string; code?: string } | undefined;
      const status = e.response?.status ?? 500;
      const res = NextResponse.json(
        { message: data?.message ?? "خطا", code: data?.code },
        { status },
      );
      // رمز نادرست یا نشست نامعتبر: خروج کامل
      return status === 401 ? clearAdminSessionCookies(res) : res;
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
