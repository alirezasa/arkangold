// تحویل فیزیکی: شمش‌های قابل انتخاب + موجودی و محاسبه‌ی مابه‌التفاوت
import { proxy } from "../../_lib/proxy";

export async function GET() {
  return proxy("/gold-delivery/bars");
}
