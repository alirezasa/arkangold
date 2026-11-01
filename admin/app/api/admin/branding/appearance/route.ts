// admin/app/api/admin/branding/appearance/route.ts — رنگ‌ها و فونت سیستم (ظاهر و تم)
import { revalidateTag } from "next/cache";
import { adminProxy } from "@/app/lib/adminProxy";
import { THEME_TAG } from "@/app/lib/theme";

export async function GET() {
  return adminProxy("/admin/branding/appearance");
}

export async function PUT(req: Request) {
  const res = await adminProxy("/admin/branding/appearance", { method: "PUT", data: await req.json() });
  if (res.ok) revalidateTag(THEME_TAG, { expire: 0 });
  return res;
}
