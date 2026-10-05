// admin/app/api/admin/admins/[id]/reset-mfa/route.ts
// ابطال برنامه‌ی احراز هویت یک ادمین (گم شدن/سرقت گوشی) + ارسال رمز موقت جدید به موبایل او
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/admins/${id}/reset-mfa`, { method: "POST", data: {} });
}
