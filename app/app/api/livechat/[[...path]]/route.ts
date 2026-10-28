// app/app/api/livechat/[[...path]]/route.ts
//
// BFF ویجت چت آنلاین: توکن دسترسی کاربر واردشده (کوکی HttpOnly) به API اضافه می‌شود تا گفتگو به
// حساب کاربر متصل شود؛ توکن بازدیدکننده (x-livechat-token) عیناً منتقل می‌شود. فقط مسیرهای مجاز
// ویجت عبور داده می‌شوند. پیام‌ها خود از کانال بلادرنگ (Socket.IO) مستقیم به API می‌روند.
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientIdentityHeaders } from "@/lib/client-identity";

const API =
  process.env.NEST_ORIGIN ||
  process.env.NEST_API_URL ||
  (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Ctx = { params: Promise<{ path?: string[] }> };

function allowed(method: string, path: string[]): boolean {
  const [a, b, ...rest] = path;
  if (rest.length) return false;
  if (method === "POST") return (a === "session" || a === "upload") && !b;
  if (method === "GET") return (a === "messages" && !b) || (a === "attachments" && !!b && UUID.test(b));
  return false;
}

async function headersFor(req: NextRequest, json: boolean) {
  const h: Record<string, string> = { ...(await clientIdentityHeaders()) };
  const token = req.headers.get("x-livechat-token");
  if (token && token.length <= 200) h["x-livechat-token"] = token;
  const access = (await cookies()).get("accessToken")?.value;
  if (access) h.Authorization = `Bearer ${access}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function forward(req: NextRequest, ctx: Ctx, method: "GET" | "POST") {
  const path = (await ctx.params).path ?? [];
  if (!allowed(method, path)) return NextResponse.json({ message: "یافت نشد" }, { status: 404 });
  const url = `${API}/livechat/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const isUpload = path[0] === "upload";
  try {
    let body: BodyInit | undefined;
    if (method === "POST") body = isUpload ? await req.formData() : await req.text();
    const res = await fetch(url, {
      method,
      headers: await headersFor(req, method === "POST" && !isUpload),
      body,
      cache: "no-store",
    });
    if (path[0] === "attachments" && res.ok) {
      return new NextResponse(res.body, {
        status: 200,
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
          "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const data = await res.json().catch(() => ({ message: "پاسخ نامعتبر از سرور" }));
    const message = Array.isArray(data?.message) ? data.message[0] : data?.message;
    return NextResponse.json(res.ok ? data : { ...data, message }, { status: res.status });
  } catch {
    return NextResponse.json({ message: "ارتباط با سرور چت برقرار نشد" }, { status: 502 });
  }
}

export const GET = (req: NextRequest, ctx: Ctx) => forward(req, ctx, "GET");
export const POST = (req: NextRequest, ctx: Ctx) => forward(req, ctx, "POST");
