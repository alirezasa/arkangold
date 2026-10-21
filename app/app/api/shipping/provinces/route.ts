// فهرست استان‌ها و شهرهای پیشنهادی فرم آدرس
import { proxy } from "@/app/api/_lib/proxy";

export async function GET() {
  return proxy("/shipping/provinces");
}
