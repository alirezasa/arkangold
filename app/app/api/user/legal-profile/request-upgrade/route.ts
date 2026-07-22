// app/app/api/user/legal-profile/request-upgrade/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";

const NEST_API_URL = "http://localhost:5000";

export async function POST() {
  try {
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const res = await axios.post(
      `${NEST_API_URL}/users/me/request-legal-upgrade`,
      {},
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return NextResponse.json(res.data);
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as { message?: string } | undefined;
      return NextResponse.json(
        { message: data?.message || "خطا" },
        { status: error.response?.status || 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
