// admin/app/api/admin/branding/appearance/colors/route.ts — بازگشت رنگ‌ها به پیش‌فرض
import { revalidateTag } from "next/cache";
import { adminProxy } from "@/app/lib/adminProxy";
import { THEME_TAG } from "@/app/lib/theme";

export async function DELETE() {
  const res = await adminProxy("/admin/branding/appearance/colors", { method: "DELETE" });
  if (res.ok) revalidateTag(THEME_TAG, { expire: 0 });
  return res;
}
