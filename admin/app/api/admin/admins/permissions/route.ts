// admin/app/api/admin/admins/permissions/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/admins/permissions");
}
