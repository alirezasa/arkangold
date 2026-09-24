// admin/app/api/admin/discount-codes/stats/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/discount-codes/stats");
}
