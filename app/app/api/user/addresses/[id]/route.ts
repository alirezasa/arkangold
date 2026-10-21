// ویرایش و حذف آدرس کاربر
import { proxy } from "@/app/api/_lib/proxy";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return proxy(`/users/me/addresses/${encodeURIComponent(id)}`, {
    method: "PATCH",
    data: await req.json(),
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return proxy(`/users/me/addresses/${encodeURIComponent(id)}`, { method: "DELETE" });
}
