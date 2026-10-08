import { proxyAdmin } from "../../_lib";

export async function GET() {
  return proxyAdmin("/admin/hologram/incidents/summary");
}
