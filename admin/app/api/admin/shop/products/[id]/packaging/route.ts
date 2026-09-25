// admin/app/api/admin/shop/products/[id]/packaging/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/shop/products/${encodeURIComponent(id)}/packaging`);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/shop/products/${encodeURIComponent(id)}/packaging`, {
    method: "PUT",
    data: await req.json(),
  });
}
