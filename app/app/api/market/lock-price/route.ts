// app/app/api/market/lock-price/route.ts
import { proxy } from "../../_lib/proxy";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return proxy("/market/lock-price", { method: "POST", data: body });
}
