// admin/app/api/admin/users/[id]/addresses/[addressId]/route.ts
// ویرایش و حذف (نرم) آدرس کاربر
import { adminProxy } from "@/app/lib/adminProxy";

type Ctx = { params: Promise<{ id: string; addressId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id, addressId } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/addresses/${addressId}`, {
    method: "PATCH",
    data: body,
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, addressId } = await params;
  return adminProxy(`/admin/users/${id}/addresses/${addressId}`, {
    method: "DELETE",
  });
}
