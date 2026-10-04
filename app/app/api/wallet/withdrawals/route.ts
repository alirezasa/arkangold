// app/app/api/wallet/withdrawals/route.ts — فهرست درخواست‌های برداشت کاربر
import { proxy } from "@/app/api/_lib/proxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return proxy("/wallet/withdrawals", { params: Object.fromEntries(searchParams) });
}
