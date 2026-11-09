// admin/app/api/admin/users/[id]/fees/route.ts
// کارمزد اختصاصی کاربر (خرید/فروش طلا، برداشت) — feePercent: null یعنی بازگشت به نرخ پیش‌فرض سیستم
import { adminProxy } from "@/app/lib/adminProxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/fees`, { method: "PATCH", data: body });
}
