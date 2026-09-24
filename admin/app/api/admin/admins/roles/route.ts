// admin/app/api/admin/admins/roles/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/admins/roles");
}

export async function POST(req: Request) {
  return adminProxy("/admin/admins/roles", {
    method: "POST",
    data: await req.json(),
  });
}
