// تحویل فیزیکی: سفارش‌های شمش ثبت‌شده با طلای آب‌شده
import { proxy } from "../../_lib/proxy";

export async function GET() {
  return proxy("/gold-delivery/orders");
}
