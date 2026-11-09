// admin/app/api/admin/users/[id]/limits/route.ts
// سقف‌های معاملاتی کاربر (خرید/فروش روزانه، برداشت ماهانه، انتقال و تحویل فیزیکی)
import { adminProxy } from "@/app/lib/adminProxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/limits`, { method: "PATCH", data: body });
}
