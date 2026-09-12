// app/app/api/invoices/route.ts
import { NextRequest } from "next/server";
import { proxy } from "@/app/api/_lib/proxy";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  return proxy("/invoices", { params });
}
