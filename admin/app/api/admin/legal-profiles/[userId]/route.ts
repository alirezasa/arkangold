// admin/app/api/admin/legal-profiles/[userId]/route.ts
// ویرایش (PATCH) و حذف (DELETE) اطلاعات حقوقی کاربر
import { adminProxy } from "@/app/lib/adminProxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/legal-profiles/${userId}`, { method: "PATCH", data: body });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return adminProxy(`/admin/legal-profiles/${userId}`, { method: "DELETE" });
}
