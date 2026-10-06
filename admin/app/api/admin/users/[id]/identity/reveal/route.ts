// admin/app/api/admin/users/[id]/identity/reveal/route.ts
// FDP_ACC_EXT.1.5 — نمایش کامل کد ملی/تاریخ تولد کاربر فقط با درخواست صریح (ثبت در ممیزی)
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/users/${encodeURIComponent(id)}/identity/reveal`, {
    method: "POST",
  });
}
