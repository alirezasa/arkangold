// admin/app/lib/forward.ts
//
// پروکسی عمومی catch-all برای ماژول‌هایی با endpointهای زیاد (حسابداری، خزانه،
// موجودی شمش، شرکای فروش) — مسیر و query string عیناً به API منتقل می‌شود.
import { adminProxy } from "@/app/lib/adminProxy";

export type ProxyMethod = "GET" | "POST" | "PATCH" | "DELETE";

export async function forward(req: Request, base: string, path: string[] | undefined, method: ProxyMethod) {
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

/** سازنده‌ی handlerهای GET/POST/PATCH برای یک مسیر catch-all */
export function catchAll(base: string) {
  type Ctx = { params: Promise<{ path?: string[] }> };
  return {
    GET: async (req: Request, { params }: Ctx) => forward(req, base, (await params).path, "GET"),
    POST: async (req: Request, { params }: Ctx) => forward(req, base, (await params).path, "POST"),
    PATCH: async (req: Request, { params }: Ctx) => forward(req, base, (await params).path, "PATCH"),
  };
}
