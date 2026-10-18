// admin/app/api/admin/deposit-receipts/[id]/[receiptId]/route.ts
//
// تصویر فیش واریز از همین مبدأ: API یک URL امضاشده‌ی کوتاه‌عمر از فضای ذخیره‌سازی (S3) می‌دهد که
// مبدأ دیگری دارد و CSP پنل (img-src 'self') نمایش مستقیم آن را مسدود می‌کرد؛ این route فایل را
// سمت سرور دریافت و بدون کش به مرورگر می‌دهد. صدور URL همچنان در API ثبت (Audit) می‌شود.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; receiptId: string }> },
) {
  const token = (await cookies()).get("adminAccessToken")?.value;
  if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id, receiptId } = await params;

  let url: string;
  try {
    const res = await axios.get<{ url: string }>(
      `${NEST}/admin/deposits/${encodeURIComponent(id)}/receipts/${encodeURIComponent(receiptId)}/url`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    url = res.data.url;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      return NextResponse.json(
        { message: e.response?.data?.message ?? "خطا" },
        { status: e.response?.status ?? 500 },
      );
    }
    return NextResponse.json({ message: "خطای سرور" }, { status: 500 });
  }

  try {
    const file = await fetch(url, { cache: "no-store" });
    if (!file.ok) {
      return NextResponse.json({ message: "فایل رسید در دسترس نیست" }, { status: 502 });
    }
    const type = (file.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    return new NextResponse(await file.arrayBuffer(), {
      headers: {
        "Content-Type": ALLOWED_TYPES.has(type) ? type : "application/octet-stream",
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ message: "دریافت فایل رسید ناموفق بود" }, { status: 502 });
  }
}
