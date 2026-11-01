// admin/app/api/admin/branding/appearance/font/[slot]/route.ts — بارگذاری/حذف فونت سفارشی
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { adminProxy, NEST } from "@/app/lib/adminProxy";
import { clientIdentityHeaders } from "@/lib/client-identity";
import { ADMIN_ACCESS_COOKIE } from "@/lib/cookie-names";
import { THEME_TAG } from "@/app/lib/theme";

const SLOTS = new Set(["regular", "bold"]);

export async function POST(req: Request, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (!SLOTS.has(slot)) return NextResponse.json({ message: "وزن فونت نامعتبر" }, { status: 400 });
  const token = (await cookies()).get(ADMIN_ACCESS_COOKIE)?.value;
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const res = await fetch(`${NEST}/admin/branding/appearance/font/${slot}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(await clientIdentityHeaders()) },
      body: await req.formData(),
    });
    const data = await res.json();
    if (res.ok) revalidateTag(THEME_TAG, { expire: 0 });
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "خطا در بارگذاری فونت" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slot: string }> }) {
  const { slot } = await params;
  if (!SLOTS.has(slot)) return NextResponse.json({ message: "وزن فونت نامعتبر" }, { status: 400 });
  const res = await adminProxy(`/admin/branding/appearance/font/${slot}`, { method: "DELETE" });
  if (res.ok) revalidateTag(THEME_TAG, { expire: 0 });
  return res;
}
