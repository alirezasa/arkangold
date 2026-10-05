import { proxy } from "@/app/api/_lib/proxy";

// وضعیت تطبیق شاهکار شماره موبایل با کد ملی
export async function GET() {
  return proxy("/users/me/mobile-verification");
}
