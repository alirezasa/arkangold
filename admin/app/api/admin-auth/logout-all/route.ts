// admin/app/api/admin-auth/logout-all/route.ts
// خروج از همه‌ی دستگاه‌ها (از جمله دستگاه فعلی)
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { clearAdminSessionCookies } from "@/app/lib/session-cookies";

export async function POST() {
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (token) {
    await axios
      .post(`${NEST}/admin-auth/logout-all`, null, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .catch(() => undefined);
  }
  return clearAdminSessionCookies(NextResponse.json({ success: true }));
}
