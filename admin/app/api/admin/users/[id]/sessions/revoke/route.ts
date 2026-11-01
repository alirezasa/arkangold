// FTA_TSE_EXT.3.5 — خاتمه‌ی همه‌ی نشست‌های یک کاربر توسط کارشناس
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return adminProxy(`/admin/users/${encodeURIComponent(id)}/sessions/revoke`, { method: "POST" });
}
