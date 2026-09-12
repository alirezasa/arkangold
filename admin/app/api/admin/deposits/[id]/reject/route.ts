// admin/app/api/admin/deposits/[id]/reject/route.ts
import { NextRequest } from "next/server";
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  return adminProxy(`/admin/deposits/${id}/reject`, {
    method: "POST",
    data: { reason: body?.reason },
  });
}
