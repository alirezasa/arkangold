// admin/app/api/admin/admins/roles/[roleId]/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

type Ctx = { params: Promise<{ roleId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { roleId } = await params;
  return adminProxy(`/admin/admins/roles/${encodeURIComponent(roleId)}`, {
    method: "PATCH",
    data: await req.json(),
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { roleId } = await params;
  return adminProxy(`/admin/admins/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
  });
}
