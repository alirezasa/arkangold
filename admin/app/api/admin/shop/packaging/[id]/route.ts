// admin/app/api/admin/shop/packaging/[id]/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/shop/packaging/${encodeURIComponent(id)}`, {
    method: "PATCH",
    data: await req.json(),
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/shop/packaging/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
