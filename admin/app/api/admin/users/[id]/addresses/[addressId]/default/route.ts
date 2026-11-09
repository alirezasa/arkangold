// admin/app/api/admin/users/[id]/addresses/[addressId]/default/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; addressId: string }> },
) {
  const { id, addressId } = await params;
  return adminProxy(`/admin/users/${id}/addresses/${addressId}/default`, {
    method: "POST",
  });
}
