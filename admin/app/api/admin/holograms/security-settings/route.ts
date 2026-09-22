import { proxyAdmin } from "../_lib";

export async function GET() {
  return proxyAdmin("/admin/hologram/security-settings");
}

export async function PUT(req: Request) {
  const body = (await req.json()) as unknown;
  return proxyAdmin("/admin/hologram/security-settings", { method: "PUT", data: body });
}
