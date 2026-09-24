// admin/app/api/admin/referrals/stats/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/referrals/stats");
}
