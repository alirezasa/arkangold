// FTA_TSE_EXT.4.2 — شروع/تأیید «تأیید ثانویه» پیش از عملیات حساس
import { NextResponse } from "next/server";
import { proxy } from "../../../_lib/proxy";

const ALLOWED = new Set(["start", "verify"]);

export async function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  if (!ALLOWED.has(action)) return NextResponse.json({ message: "مسیر نامعتبر" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  return proxy(`/auth/step-up/${action}`, { method: "POST", data: body });
}
