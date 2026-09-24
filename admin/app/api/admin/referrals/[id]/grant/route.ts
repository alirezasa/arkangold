// admin/app/api/admin/referrals/[id]/grant/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/referrals/${encodeURIComponent(id)}/grant`, {
    method: "POST",
  });
}
