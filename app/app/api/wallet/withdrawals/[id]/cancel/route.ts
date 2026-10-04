// app/app/api/wallet/withdrawals/[id]/cancel/route.ts — لغو درخواست برداشت در انتظار بررسی
import { proxy } from "@/app/api/_lib/proxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/wallet/withdrawals/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
