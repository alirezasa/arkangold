// app/app/api/discount-codes/validate/route.ts
import { proxy } from "../../_lib/proxy";

export async function POST(req: Request) {
  return proxy("/discount-codes/validate", {
    method: "POST",
    data: await req.json(),
  });
}
