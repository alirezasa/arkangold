// app/app/api/user/buyback/[[...path]]/route.ts
// بازخرید شمش (فروش شمش به آرکان گلد): overview، ثبت/فهرست، جزئیات، لغو و پاسخ به قیمت نهایی
import { NextResponse } from "next/server";
import { proxy } from "../../../_lib/proxy";

type Ctx = { params: Promise<{ path?: string[] }> };

const SEGMENT = /^[A-Za-z0-9-]{1,64}$/;

function target(path: string[] | undefined) {
  const parts = path ?? [];
  if (parts.length > 2 || !parts.every((p) => SEGMENT.test(p))) return null;
  return `/user/buyback${parts.length ? `/${parts.join("/")}` : ""}`;
}

export async function GET(_req: Request, { params }: Ctx) {
  const url = target((await params).path);
  if (!url) return NextResponse.json({ message: "مسیر نامعتبر" }, { status: 404 });
  return proxy(url);
}

export async function POST(req: Request, { params }: Ctx) {
  const url = target((await params).path);
  if (!url) return NextResponse.json({ message: "مسیر نامعتبر" }, { status: 404 });
  const text = await req.text();
  return proxy(url, { method: "POST", data: text ? (JSON.parse(text) as unknown) : {} });
}
