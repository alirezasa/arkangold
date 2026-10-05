import { proxy } from "@/app/api/_lib/proxy";

export async function GET() {
  return proxy("/users/me/bank-accounts");
}

// ثبت کارت: فقط شماره کارت؛ مالکیت و شبا در API استعلام می‌شود
export async function POST(request: Request) {
  const body = (await request.json()) as { cardNumber?: string };
  return proxy("/users/me/bank-accounts", {
    method: "POST",
    data: { cardNumber: body.cardNumber },
  });
}
