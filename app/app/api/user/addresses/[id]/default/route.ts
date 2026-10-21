// انتخاب آدرس پیش‌فرض
import { proxy } from "@/app/api/_lib/proxy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxy(`/users/me/addresses/${encodeURIComponent(id)}/default`, { method: "POST" });
}
