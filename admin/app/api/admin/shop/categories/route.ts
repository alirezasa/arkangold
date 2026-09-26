import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
const NEST = "http://localhost:5000";

async function getToken() {
  return (await cookies()).get("adminAccessToken")?.value;
}

function errRes(e: unknown) {
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

export async function GET() {
  try {
    const token = await getToken();
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const res = await axios.get(`${NEST}/admin/shop/categories`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    return errRes(e);
  }
}

export async function POST(req: Request) {
  try {
    const token = await getToken();
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const res = await axios.post(`${NEST}/admin/shop/categories`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    return errRes(e);
  }
}
