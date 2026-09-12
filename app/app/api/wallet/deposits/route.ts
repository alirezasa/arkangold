// app/app/api/wallet/deposits/route.ts
import { NextRequest } from "next/server";
import { proxy } from "@/app/api/_lib/proxy";

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  return proxy("/wallet/deposits", { params });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  // کلید idempotency باید دست‌نخورده عبور کند
  const idempotencyKey = req.headers.get("idempotency-key");
  return proxy("/wallet/deposits", {
    method: "POST",
    data: body,
    headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
  });
}
