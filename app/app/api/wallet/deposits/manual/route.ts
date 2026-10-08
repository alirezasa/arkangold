// app/app/api/wallet/deposits/manual/route.ts
import { NextRequest } from "next/server";
import { proxy } from "@/app/api/_lib/proxy";

// ثبت واریز کارت به کارت / حساب به حساب پس از انجام واریز
export async function POST(req: NextRequest) {
  const body = await req.json();
  const idempotencyKey = req.headers.get("idempotency-key");
  return proxy("/wallet/deposits/manual", {
    method: "POST",
    data: body,
    headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : {},
  });
}
