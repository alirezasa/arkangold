// admin/app/api/admin/deposits/[id]/receipts/[receiptId]/url/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> },
) {
  const { id, receiptId } = await params;
  return adminProxy(`/admin/deposits/${id}/receipts/${receiptId}/url`);
}
