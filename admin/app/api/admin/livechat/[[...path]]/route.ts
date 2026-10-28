// admin/app/api/admin/livechat/[[...path]]/route.ts — پروکسی میز کار و مدیریت چت آنلاین
//
// مسیرهای JSON از پروکسی عمومی catch-all عبور می‌کنند؛ آپلود پیوست (multipart) و دریافت پیوست
// (فایل باینری) جداگانه و با همان توکن ادمین از کوکی HttpOnly منتقل می‌شوند.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { forward } from "@/app/lib/forward";
import { NEST } from "@/app/lib/adminProxy";
import { clientIdentityHeaders } from "@/lib/client-identity";

type Ctx = { params: Promise<{ path?: string[] }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "/admin/livechat";

async function authHeaders() {
  const token = (await cookies()).get("adminAccessToken")?.value;
  return token ? { Authorization: `Bearer ${token}`, ...(await clientIdentityHeaders()) } : null;
}

async function errorFrom(res: Response) {
  const data = (await res.json().catch(() => ({}))) as { message?: string | string[]; code?: string };
  const message = Array.isArray(data.message) ? data.message[0] : (data.message ?? "خطا");
  return NextResponse.json({ message, ...(data.code ? { code: data.code } : {}) }, { status: res.status });
}

export async function GET(req: Request, { params }: Ctx) {
  const path = (await params).path ?? [];
  if (path[0] === "attachments" && path.length === 2 && UUID.test(path[1])) {
    const headers = await authHeaders();
    if (!headers) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const res = await fetch(`${NEST}${BASE}/attachments/${path[1]}`, { headers, cache: "no-store" });
    if (!res.ok) return errorFrom(res);
    return new NextResponse(res.body, {
      headers: {
        "Content-Type": res.headers.get("content-type") ?? "application/octet-stream",
        "Content-Disposition": res.headers.get("content-disposition") ?? "attachment",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  return forward(req, BASE, path, "GET");
}

export async function POST(req: Request, { params }: Ctx) {
  const path = (await params).path ?? [];
  if (path[0] === "conversations" && path[2] === "upload" && path.length === 3 && UUID.test(path[1])) {
    const headers = await authHeaders();
    if (!headers) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const res = await fetch(`${NEST}${BASE}/conversations/${path[1]}/upload`, {
      method: "POST",
      headers,
      body: await req.formData(),
      cache: "no-store",
    });
    if (!res.ok) return errorFrom(res);
    return NextResponse.json(await res.json());
  }
  return forward(req, BASE, path, "POST");
}

export async function PATCH(req: Request, { params }: Ctx) {
  return forward(req, BASE, (await params).path, "PATCH");
}
export async function PUT(req: Request, { params }: Ctx) {
  return forward(req, BASE, (await params).path, "PUT");
}
export async function DELETE(req: Request, { params }: Ctx) {
  return forward(req, BASE, (await params).path, "DELETE");
}
