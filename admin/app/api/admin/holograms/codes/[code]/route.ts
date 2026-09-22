import { proxyAdmin } from "../../_lib";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return proxyAdmin(`/admin/hologram/codes/${code}`);
}
