// app/app/api/wallet/deposits/[id]/receipts/[receiptId]/url/route.ts
import { proxy } from "@/app/api/_lib/proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> },
) {
  const { id, receiptId } = await params;
  return proxy(`/wallet/deposits/${id}/receipts/${receiptId}/url`);
}
