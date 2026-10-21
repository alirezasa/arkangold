// روش‌ها و هزینه‌ی ارسال سبد خرید برای آدرس انتخابی
import { proxy } from "@/app/api/_lib/proxy";

export async function GET(req: Request) {
  const addressId = new URL(req.url).searchParams.get("addressId") ?? "";
  return proxy("/shipping/options", { params: { addressId } });
}
