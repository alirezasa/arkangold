// admin/app/api/admin/legal-profiles/documents/[id]/download/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const NEST = "http://localhost:5000";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (!token)
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const res = await fetch(
    `${NEST}/admin/legal-profiles/documents/${id}/download`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  const blob = await res.blob();
  return new NextResponse(blob, {
    status: res.status,
    headers: {
      "Content-Type":
        res.headers.get("Content-Type") ?? "application/octet-stream",
      "Content-Disposition":
        res.headers.get("Content-Disposition") ?? "attachment",
    },
  });
}
