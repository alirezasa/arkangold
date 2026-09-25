// admin/app/api/admin/shop/packaging/[id]/image/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminProxy, NEST } from "@/app/lib/adminProxy";

// آپلود تصویر طرح — فرم بدون parse مجدد مستقیم به API عبور داده می‌شود
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  try {
    const res = await fetch(
      `${NEST}/admin/shop/packaging/${encodeURIComponent(id)}/image`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: await req.formData(),
      },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "خطا در آپلود تصویر" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(
    `/admin/shop/packaging/${encodeURIComponent(id)}/image`,
    { method: "DELETE" },
  );
}
