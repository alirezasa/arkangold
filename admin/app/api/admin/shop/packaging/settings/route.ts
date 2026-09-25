// admin/app/api/admin/shop/packaging/settings/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function PUT(req: Request) {
  return adminProxy("/admin/shop/packaging/settings", {
    method: "PUT",
    data: await req.json(),
  });
}
