import { proxy } from "../../../../../_lib/proxy";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as unknown;
  return proxy(`/user/hologram/transfer-requests/${id}/confirm`, { method: "POST", data: body });
}
