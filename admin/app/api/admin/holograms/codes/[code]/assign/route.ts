import { proxyAdmin } from "../../../_lib";

export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const body = (await req.json()) as unknown;
  return proxyAdmin(`/admin/hologram/codes/${code}/assign`, { method: "POST", data: body });
}
