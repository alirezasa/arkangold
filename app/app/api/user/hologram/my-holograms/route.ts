import { proxy } from "../../../_lib/proxy";

export async function GET() {
  return proxy("/user/hologram/my-holograms");
}
