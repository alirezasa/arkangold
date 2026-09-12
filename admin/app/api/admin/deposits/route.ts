// admin/app/api/admin/deposits/route.ts
import { NextRequest } from "next/server";
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  return adminProxy("/admin/deposits", { params });
}
