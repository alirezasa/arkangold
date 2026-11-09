// admin/app/api/admin/users/[id]/name/route.ts
// ویرایش نام کاربر (فقط پیش از تأیید هویت از ثبت احوال)
import { adminProxy } from "@/app/lib/adminProxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/name`, { method: "PATCH", data: body });
}
