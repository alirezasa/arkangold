// app/app/api/wallet/deposit/large-transfer/[id]/proforma/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = (await cookies()).get("accessToken")?.value;
  if (!token)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const download = searchParams.get("download");

  try {
    const res = await axios.get(
      `${NEST}/wallet/deposit/large-transfer/${id}/proforma${download ? "?download=1" : ""}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        responseType: "arraybuffer",
      },
    );
    return new NextResponse(res.data, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          (res.headers["content-disposition"] as string) ?? "inline",
      },
    });
  } catch {
    return NextResponse.json(
      { message: "خطا در تولید فاکتور" },
      { status: 500 },
    );
  }
}
