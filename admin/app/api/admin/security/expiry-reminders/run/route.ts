import { adminProxy } from "@/app/lib/adminProxy";

// اجرای دستی یادآوری انقضای کلیدهای API و اعتبارنامه‌ها (FIA_UID_EXT.1.5)
export async function POST() {
  return adminProxy("/admin/security/expiry-reminders/run", { method: "POST" });
}
