import { adminProxy } from "@/app/lib/adminProxy";

// وضعیت ورود دومرحله‌ای و دستگاه‌های شناخته‌شده‌ی ادمین
export async function GET() {
  return adminProxy("/admin-auth/mfa");
}
