// تحویل فیزیکی: قفل قیمت شمش انتخابی و برآورد پرداخت
import { proxy } from "../../_lib/proxy";

export async function POST(req: Request) {
  const body = (await req.json()) as Record<string, unknown>;
  return proxy("/gold-delivery/quote", {
    method: "POST",
    data: {
      variantId: body.variantId,
      useExtraGold: body.useExtraGold,
      useRialWallet: body.useRialWallet,
    },
  });
}
