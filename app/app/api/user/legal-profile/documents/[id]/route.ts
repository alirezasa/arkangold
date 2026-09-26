// app/app/api/user/legal-profile/documents/[id]/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST_API_URL = "http://localhost:5000";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const token = (await cookies()).get("accessToken")?.value;
    if (!token)
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const res = await fetch(
      `${NEST_API_URL}/users/me/legal-profile/documents/${id}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }
}
