import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";

async function getToken() {
  return (await cookies()).get("adminAccessToken")?.value;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = await getToken();
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const res = await axios.get(`${NEST}/admin/shop/products/${id}/images`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e))
      return NextResponse.json(
        { message: e.response?.data?.message || "خطا" },
        { status: e.response?.status || 500 },
      );
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}

// آپلود چندفایلی — فرم رو بدون parse کردن مستقیم عبور می‌دیم
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = await getToken();
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const incomingForm = await req.formData();

    const res = await fetch(`${NEST}/admin/shop/products/${id}/images`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: incomingForm,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      { message: "خطا در آپلود تصاویر" },
      { status: 500 },
    );
  }
}
