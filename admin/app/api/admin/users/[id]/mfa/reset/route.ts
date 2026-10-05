// admin/app/api/admin/users/[id]/mfa/reset/route.ts
// بازیابی ورود دومرحله‌ای کاربر پس از احراز هویت مجدد (FIA_UID_EXT.1.4)
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/mfa/reset`, { method: "POST", data: body });
}
