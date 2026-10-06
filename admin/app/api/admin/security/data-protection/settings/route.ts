import { adminProxy } from "@/app/lib/adminProxy";

// ذخیره‌ی تنظیمات حفاظت داده (نشست تطبیقی، دسترسی پنل، ضدبدافزار، تأیید دونفره)
export async function PUT(req: Request) {
  return adminProxy("/admin/security/data-protection/settings", {
    method: "PUT",
    data: await req.json(),
  });
}
