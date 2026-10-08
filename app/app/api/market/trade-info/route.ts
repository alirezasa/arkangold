// app/app/api/market/trade-info/route.ts
import { proxy } from "../../_lib/proxy";

// حدود، نرخ کارمزد و سقف مصرف‌شده‌ی معامله طلای آب‌شده
export async function GET() {
  return proxy("/market/trade-info");
}
