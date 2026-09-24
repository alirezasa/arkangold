// admin/app/api/admin/payroll/gold-price/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

// قیمت لحظه‌ای طلا برای پیش‌نمایش تبدیل مبلغ ریالی به میلی‌گرم در پلن پی‌رول
export async function GET() {
  return adminProxy("/admin/payroll/gold-price");
}
