// app/app/api/user/legal-profile/documents/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API_URL = "http://localhost:5000";

export async function POST(request: Request) {
  try {
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const formData = await request.formData();
    const res = await fetch(
      `${NEST_API_URL}/users/me/legal-profile/documents`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      },
    );

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "خطا در آپلود فایل" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const res = await fetch(
      `${NEST_API_URL}/users/me/legal-profile/documents`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
