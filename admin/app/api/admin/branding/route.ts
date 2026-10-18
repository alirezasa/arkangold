// admin/app/api/admin/branding/route.ts — پیش‌نمایش لوگو، مهر و امضای شرکت
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/branding");
}
