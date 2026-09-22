import { proxy } from "../../../_lib/proxy";

export async function POST(req: Request) {
  const body = (await req.json()) as unknown;
  const idempotencyKey = req.headers.get("idempotency-key");
  return proxy("/user/hologram/transfer-requests", {
    method: "POST",
    data: body,
    headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined,
  });
}
