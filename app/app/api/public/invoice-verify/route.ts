// app/app/api/public/invoice-verify/route.ts
//
// استعلام عمومی و بدون‌نیاز-به-لاگین فاکتور/پیش‌فاکتور از روی QR
// GET ?n={شماره سند}&t={توکن QR} → GET /verify/{n}?t= نست
import { NextResponse } from "next/server";
import axios from "axios";
import { NEST, errorResponse } from "../../_lib/proxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const n = (searchParams.get("n") ?? "").trim().slice(0, 40);
  const t = (searchParams.get("t") ?? "").trim().slice(0, 64);
  if (!n) {
    return NextResponse.json({ message: "شماره‌ی سند را وارد کنید" }, { status: 400 });
  }
  try {
    const res = await axios.get(`${NEST}/verify/${encodeURIComponent(n)}`, {
      params: t ? { t } : undefined,
    });
    return NextResponse.json(res.data);
  } catch (e) {
    return errorResponse(e);
  }
}
