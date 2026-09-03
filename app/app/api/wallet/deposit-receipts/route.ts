// app/app/api/wallet/deposit-receipts/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API_URL = "http://localhost:5000";

export async function POST(request: Request) {
  try {
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const res = await fetch(`${NEST_API_URL}/wallet/deposit-receipts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "خطا در ارسال فیش" }, { status: 500 });
  }
}