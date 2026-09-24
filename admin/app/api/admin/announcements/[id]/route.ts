// admin/app/api/admin/announcements/[id]/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminProxy(`/admin/announcements/${encodeURIComponent(id)}`, {
    method: "PATCH",
    data: await req.json(),
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminProxy(`/admin/announcements/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
