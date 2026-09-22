import { proxy } from "../../../../_lib/proxy";

export async function GET() {
  return proxy("/user/hologram/transfer-requests/incoming");
}
