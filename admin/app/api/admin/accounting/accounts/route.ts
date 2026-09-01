import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";

export async function GET() {
  try {
    const token = (await cookies()).get("adminAccessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const res = await axios.get(`${NEST}/admin/accounting/accounts`, {
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