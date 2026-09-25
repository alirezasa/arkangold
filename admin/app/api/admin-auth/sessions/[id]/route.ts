// admin/app/api/admin-auth/sessions/[id]/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin-auth/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
