import { proxy } from "@/app/api/_lib/proxy";

// حذف کارت بانکی (فقط کارت‌هایی که در برداشت استفاده نشده‌اند)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxy(`/users/me/bank-accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
