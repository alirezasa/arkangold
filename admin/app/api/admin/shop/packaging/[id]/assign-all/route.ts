// admin/app/api/admin/shop/packaging/[id]/assign-all/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(
    `/admin/shop/packaging/${encodeURIComponent(id)}/assign-all`,
    { method: "POST" },
  );
}
