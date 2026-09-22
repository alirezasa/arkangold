import { proxyAdmin } from "../../../_lib";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyAdmin(`/admin/hologram/batches/${id}/print`);
}
