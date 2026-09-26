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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = await getToken();
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const res = await axios.patch(`${NEST}/admin/shop/variants/${id}`, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    return errRes(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = await getToken();
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    const res = await axios.delete(`${NEST}/admin/shop/variants/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (e: unknown) {
    return errRes(e);
  }
}
