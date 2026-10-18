// admin/app/api/admin-auth/session/ping/route.ts — ثبت فعالیت واقعی کاربر (قفل عدم فعالیت)
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST() {
  return adminProxy("/admin-auth/session/ping", { method: "POST" });
}
