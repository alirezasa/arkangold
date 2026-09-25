// admin/app/api/admin-auth/sessions/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin-auth/sessions");
}
