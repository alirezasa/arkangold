// استعلام مجدد شاهکار / تأیید دستی مالکیت شماره موبایل کاربر
import { NextResponse } from "next/server";
import { adminProxy } from "@/app/lib/adminProxy";

const ACTIONS = new Set(["reinquire", "approve"]);

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ message: "عملیات نامعتبر" }, { status: 404 });
  }
  return adminProxy(
    `/admin/users/${encodeURIComponent(id)}/mobile-verification/${action}`,
    { method: "POST", data: {} },
  );
}
