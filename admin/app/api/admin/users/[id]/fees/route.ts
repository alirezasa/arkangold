// admin/app/api/admin/users/[id]/fees/route.ts
// کم یا زیاد کردن کارمزد خرید/فروش طلای کاربر (برداشت و واریز برای همه از تنظیمات سیستم است)
import { adminProxy } from "@/app/lib/adminProxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/fees`, { method: "PATCH", data: body });
}
