// app/app/api/discount-codes/mine/route.ts
import { proxy } from "../../_lib/proxy";

export async function GET() {
  return proxy("/discount-codes/mine");
}
