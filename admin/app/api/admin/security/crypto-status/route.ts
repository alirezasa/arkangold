// admin/app/api/admin/security/crypto-status/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/security/crypto-status");
}
