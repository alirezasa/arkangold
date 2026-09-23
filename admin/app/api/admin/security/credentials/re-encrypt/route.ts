// admin/app/api/admin/security/credentials/re-encrypt/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST() {
  return adminProxy("/admin/security/credentials/re-encrypt", { method: "POST" });
}
