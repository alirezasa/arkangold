// admin/app/api/admin/legal-profiles/[userId]/convert-to-real/route.ts
// تبدیل حساب حقوقی به حقیقی (حذف اطلاعات و مدارک حقوقی)
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return adminProxy(`/admin/legal-profiles/${userId}/convert-to-real`, { method: "POST", data: {} });
}
