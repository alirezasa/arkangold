// admin/app/api/admin-auth/activity/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return adminProxy("/admin-auth/activity", {
    params: Object.fromEntries(searchParams),
  });
}
