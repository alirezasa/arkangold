// admin/app/api/admin/shop/packaging/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/shop/packaging");
}

export async function POST(req: Request) {
  return adminProxy("/admin/shop/packaging", {
    method: "POST",
    data: await req.json(),
  });
}
