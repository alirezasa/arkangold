// admin/app/api/admin/referrals/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return adminProxy("/admin/referrals", {
    params: Object.fromEntries(searchParams.entries()),
  });
}
