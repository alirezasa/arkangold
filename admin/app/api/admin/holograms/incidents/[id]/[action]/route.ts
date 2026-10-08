import { NextResponse } from "next/server";
import { proxyAdmin } from "../../../_lib";

const ACTIONS = new Set(["confirm", "reject", "recover"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  if (!ACTIONS.has(action)) return NextResponse.json({ message: "عملیات نامعتبر است" }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as unknown;
  return proxyAdmin(`/admin/hologram/incidents/${encodeURIComponent(id)}/${action}`, { method: "POST", data: body });
}
