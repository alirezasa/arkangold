// admin/app/api/admin/branding/[kind]/route.ts — بارگذاری/حذف لوگو، مهر یا امضا
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminProxy, NEST } from "@/app/lib/adminProxy";
import { clientIdentityHeaders } from "@/lib/client-identity";

const KINDS = new Set(["logo", "seal", "signature"]);

export async function POST(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.has(kind)) return NextResponse.json({ message: "نوع نامعتبر" }, { status: 400 });
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const res = await fetch(`${NEST}/admin/branding/${kind}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(await clientIdentityHeaders()) },
      body: await req.formData(),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "خطا در بارگذاری تصویر" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.has(kind)) return NextResponse.json({ message: "نوع نامعتبر" }, { status: 400 });
  return adminProxy(`/admin/branding/${kind}`, { method: "DELETE" });
}
