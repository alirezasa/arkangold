import { adminProxy } from "@/app/lib/adminProxy";

// وضعیت احراز هویت (FIA) برای پنل امنیت
export async function GET() {
  return adminProxy("/admin/security/auth-status");
}
