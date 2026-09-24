// admin/app/api/admin/referrals/settings/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/referrals/settings");
}

export async function PUT(req: Request) {
  return adminProxy("/admin/referrals/settings", {
    method: "PUT",
    data: await req.json(),
  });
}
