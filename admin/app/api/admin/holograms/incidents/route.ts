import { proxyAdmin } from "../_lib";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return proxyAdmin(`/admin/hologram/incidents?${searchParams.toString()}`);
}

export async function POST(req: Request) {
  const body = (await req.json()) as unknown;
  return proxyAdmin("/admin/hologram/incidents", { method: "POST", data: body });
}
