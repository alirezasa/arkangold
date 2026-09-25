// admin/app/api/admin/agents/_proxy.ts
//
// پروکسی عمومی مسیرهای نمایندگان (مدیریت و پرتال نماینده) به API — تعداد
// endpointها زیاد است، پس به‌جای یک فایل برای هر مسیر، یک catch-all نوشته شده.
import { adminProxy } from "@/app/lib/adminProxy";

type Method = "GET" | "POST" | "PATCH" | "DELETE";

export async function forward(
  req: Request,
  base: string,
  path: string[] | undefined,
  method: Method,
) {
  const suffix = (path ?? []).map(encodeURIComponent).join("/");
  const { searchParams } = new URL(req.url);
  let data: unknown = undefined;
  if (method !== "GET" && method !== "DELETE") {
    const text = await req.text();
    data = text ? (JSON.parse(text) as unknown) : undefined;
  }
  return adminProxy(`${base}${suffix ? `/${suffix}` : ""}`, {
    method,
    data,
    params: Object.fromEntries(searchParams),
  });
}
