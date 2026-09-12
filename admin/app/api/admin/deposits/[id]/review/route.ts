// admin/app/api/admin/deposits/[id]/review/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/deposits/${id}/review/start`, { method: "POST" });
}
