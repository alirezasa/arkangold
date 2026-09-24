// admin/app/api/admin/discount-codes/[id]/usages/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  return adminProxy(`/admin/discount-codes/${encodeURIComponent(id)}/usages`, {
    params: Object.fromEntries(searchParams.entries()),
  });
}
