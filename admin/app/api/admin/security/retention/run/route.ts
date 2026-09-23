// admin/app/api/admin/security/retention/run/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST() {
  return adminProxy("/admin/security/retention/run", { method: "POST" });
}
