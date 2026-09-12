// app/app/api/wallet/deposits/[id]/route.ts
import { proxy } from "@/app/api/_lib/proxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxy(`/wallet/deposits/${id}`);
}
