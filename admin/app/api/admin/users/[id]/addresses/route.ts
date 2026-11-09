// admin/app/api/admin/users/[id]/addresses/route.ts
// آدرس‌های کاربر: فهرست (به‌همراه فهرست استان‌ها) و افزودن
import { adminProxy } from "@/app/lib/adminProxy";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return adminProxy(`/admin/users/${id}/addresses`);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return adminProxy(`/admin/users/${id}/addresses`, { method: "POST", data: body });
}
