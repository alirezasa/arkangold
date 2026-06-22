import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";
export async function POST(req: Request) {
  try {
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const res = await axios.post(
      `${NEST}/wallet/deposit/bank-transfer/initiate`,
      body,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const d = e.response?.data as { message?: string | string[] } | undefined;
      return NextResponse.json(
        {
          message: Array.isArray(d?.message)
            ? d.message[0]
            : d?.message || "خطا",
        },
        { status: e.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}

async function getToken() {
  const { cookies } = await import('next/headers');
  return (await cookies()).get('accessToken')?.value;
}
