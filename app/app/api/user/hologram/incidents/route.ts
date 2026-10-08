import { proxy } from "../../../_lib/proxy";

// گزارش‌های سرقت/مفقودی ثبت‌شده توسط کاربر
export async function GET() {
  return proxy("/user/hologram/incidents");
}

// اعلام سرقت یا مفقودی شمش توسط مالک
export async function POST(req: Request) {
  const body = (await req.json()) as unknown;
  return proxy("/user/hologram/incidents", { method: "POST", data: body });
}
