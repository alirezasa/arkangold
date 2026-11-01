import { adminProxy } from "@/app/lib/adminProxy";

// زمان‌های نشست کاربر و ادمین — سرآیند X-Step-Up-Code توسط client-identity منتقل می‌شود
export async function PUT(req: Request) {
  return adminProxy("/admin/security/session-comm/policy", {
    method: "PUT",
    data: await req.json(),
  });
}
