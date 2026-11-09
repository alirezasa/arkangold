// admin/app/api/admin/wallets/[id]/adjust/route.ts
// افزایش/کسر دستی موجودی ریالی و طلایی کاربر — سرآیند X-Step-Up-Code (کد برنامه‌ی احراز هویت)
// توسط client-identity به API منتقل می‌شود
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/wallets/${id}/adjust`, { method: "POST", data: body });
}
