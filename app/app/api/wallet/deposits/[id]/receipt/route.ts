// app/app/api/wallet/deposits/[id]/receipt/route.ts
// آپلود چندبخشی: FormData بدون parse شدن عبور داده می‌شود تا boundary
// و بایت‌های خام تصویر دست‌نخورده به NestJS برسند.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { NEST } from "@/app/api/_lib/proxy";
import { clientIdentityHeaders } from "@/lib/client-identity";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = (await cookies()).get("accessToken")?.value;
  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const res = await fetch(`${NEST}/wallet/deposits/${id}/receipt`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, ...(await clientIdentityHeaders()) },
      body: form,
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "ارسال فیش ناموفق بود" }, { status: 500 });
  }
}
