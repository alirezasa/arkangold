// admin/app/api/admin/announcements/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET() {
  return adminProxy("/admin/announcements");
}

export async function POST(req: Request) {
  return adminProxy("/admin/announcements", {
    method: "POST",
    data: await req.json(),
  });
}
