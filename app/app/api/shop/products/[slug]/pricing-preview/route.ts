import { NextResponse } from "next/server";
import axios from "axios";
const NEST = "http://localhost:5000";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(req.url);
    const qs = searchParams.toString();
    const res = await axios.get(
      `${NEST}/shop/products/${slug}/pricing-preview${qs ? `?${qs}` : ""}`,
    );
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