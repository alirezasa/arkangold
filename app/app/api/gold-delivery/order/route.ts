// تحویل فیزیکی: ثبت خرید شمش با کیف طلایی (+ کیف ریالی / درگاه)
import { proxy } from "../../_lib/proxy";

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  const idempotencyKey = req.headers.get("idempotency-key");
  return proxy("/gold-delivery/order", {
    method: "POST",
    data: {
      quoteId: body.quoteId,
      addressId: body.addressId,
      useExtraGold: body.useExtraGold,
      useRialWallet: body.useRialWallet,
      gatewayProvider: body.gatewayProvider || undefined,
    },
    headers: idempotencyKey ? { "idempotency-key": idempotencyKey } : undefined,
  });
}
