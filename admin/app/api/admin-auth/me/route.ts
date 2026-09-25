// admin/app/api/admin-auth/me/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { adminProxy } from "@/app/lib/adminProxy";

const NEST_API_URL = process.env.NEST_API_URL || (process.env.NODE_ENV === "production" ? "https://api.arkan.gold" : "http://localhost:5000");

export async function GET() {
  try {
    const token = (await cookies()).get("adminAccessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const res = await axios.get(`${NEST_API_URL}/admin-auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return NextResponse.json(res.data);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { message: error.response?.data?.message || "خطا" },
        { status: error.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const body = (await req.json()) as unknown;
  return adminProxy("/admin-auth/me", { method: "PATCH", data: body });
}
