// admin/app/api/admin-auth/sessions/revoke-others/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST() {
  return adminProxy("/admin-auth/sessions/revoke-others", { method: "POST" });
}
