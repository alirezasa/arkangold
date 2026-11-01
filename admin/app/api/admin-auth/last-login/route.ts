// FTA_TAH_EXT.1.1 — آخرین ورود موفق پیش از نشست فعلی
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin-auth/last-login");
}
