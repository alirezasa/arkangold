import { proxyAdmin } from "../../../_lib";

export async function POST(_req: Request, { params }: { params: Promise<{ ip: string }> }) {
  const { ip } = await params;
  return proxyAdmin(`/admin/hologram/rate-limit-blocks/${encodeURIComponent(ip)}/unblock`, {
    method: "POST",
  });
}
