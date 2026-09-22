import { proxy } from "../../../_lib/proxy";

export async function POST(req: Request) {
  const body = (await req.json()) as unknown;
  return proxy("/user/hologram/verify", { method: "POST", data: body });
}
