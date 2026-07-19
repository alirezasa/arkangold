// admin/app/api/admin-auth/logout/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete("adminAccessToken");
  res.cookies.delete("adminRefreshToken");
  return res;
}