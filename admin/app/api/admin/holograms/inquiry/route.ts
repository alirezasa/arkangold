import { proxyAdmin } from "../_lib";

// استعلام کارشناس — شامل هشدار سرقت/مفقودی و پرونده‌ی کامل کد
export async function POST(req: Request) {
  const body = (await req.json()) as unknown;
  return proxyAdmin("/admin/hologram/inquiry", { method: "POST", data: body });
}
