// app/app/api/market/orders/route.ts
import { proxy } from "../../_lib/proxy";

// POST: ثبت سفارش
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return proxy("/market/orders", { method: "POST", data: body });
}

// GET: تاریخچه سفارشات
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return proxy("/market/orders", {
    params: {
      page: searchParams.get("page") ?? "1",
      limit: searchParams.get("limit") ?? "20",
    },
  });
}
