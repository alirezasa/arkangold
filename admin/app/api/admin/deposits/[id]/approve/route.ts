// admin/app/api/admin/deposits/[id]/approve/route.ts
import { NextRequest } from "next/server";
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  // فقط note عبور می‌کند؛ مبلغ هرگز از کلاینت پذیرفته نمی‌شود
  return adminProxy(`/admin/deposits/${id}/approve`, {
    method: "POST",
    data: { note: body?.note },
  });
}
