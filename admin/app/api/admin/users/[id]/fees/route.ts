// admin/app/api/admin/users/[id]/fees/route.ts
// کارمزد دستی خرید/فروش طلای کاربر — feePercent: null یعنی بازگشت به تنظیمات سیستم (برداشت و واریز برای همه از تنظیمات است)
import { adminProxy } from "@/app/lib/adminProxy";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/fees`, { method: "PATCH", data: body });
}
