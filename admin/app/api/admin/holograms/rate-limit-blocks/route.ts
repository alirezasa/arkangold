import { proxyAdmin } from "../_lib";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return proxyAdmin(`/admin/hologram/rate-limit-blocks?${searchParams.toString()}`);
}
