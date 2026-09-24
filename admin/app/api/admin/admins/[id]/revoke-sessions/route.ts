// admin/app/api/admin/admins/[id]/revoke-sessions/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/admins/${encodeURIComponent(id)}/revoke-sessions`, {
    method: "POST",
  });
}
