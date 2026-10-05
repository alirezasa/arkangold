import { proxy } from "@/app/api/_lib/proxy";

// ثبت شماره‌ی جدید: تطبیق شاهکار + ارسال کد پیامکی
export async function POST(request: Request) {
  const body = (await request.json()) as { phone?: string };
  return proxy("/users/me/mobile-verification/change-phone/request", {
    method: "POST",
    data: { phone: body.phone },
  });
}
