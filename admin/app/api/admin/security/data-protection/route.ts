import { adminProxy } from "@/app/lib/adminProxy";

// وضعیت حفاظت داده و فایل (FDP/FPT) برای پنل امنیت
export async function GET() {
  return adminProxy("/admin/security/data-protection");
}
