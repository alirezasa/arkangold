import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = (await cookies()).get("adminAccessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const res = await axios.get(
      `${NEST}/admin/shop/products/${id}/pricing-preview${qs ? `?${qs}` : ""}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const data = e.response?.data as
        | { message?: string | string[] }
        | undefined;
      const message = Array.isArray(data?.message)
        ? data.message[0]
        : data?.message || "خطا";
      return NextResponse.json(
        { message },
        { status: e.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}