// admin/app/api/admin-auth/logout/route.ts
//
// خروج واقعی: ابتدا نشست در سرور باطل می‌شود (تا توکن سرقت‌شده هم بی‌اثر شود)،
// سپس کوکی‌ها پاک می‌شوند. خطای سرور (مثلاً نشست از قبل منقضی) مانع خروج نمی‌شود.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { clearAdminSessionCookies } from "@/app/lib/session-cookies";

export async function POST() {
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (token) {
    await axios
      .post(`${NEST}/admin-auth/logout`, null, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .catch(() => undefined);
  }
  return clearAdminSessionCookies(NextResponse.json({ success: true }));
}
