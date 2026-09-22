import { proxy } from "../../../../_lib/proxy";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/user/hologram/transfer-requests/${id}`);
}
