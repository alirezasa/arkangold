import { proxy } from "../../_lib/proxy";

// وضعیت ورود دومرحله‌ای و دستگاه‌های شناخته‌شده‌ی کاربر
export async function GET() {
  return proxy("/auth/mfa");
}
