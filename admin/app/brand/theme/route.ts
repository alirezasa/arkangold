// admin/app/brand/theme/route.ts — CSS تم فعلی (برای اعمال فوری پس از ذخیره در صفحه‌ی ظاهر)
import { NextResponse } from "next/server";
import { NEST } from "@/app/lib/adminProxy";
import { fetchTheme } from "@/app/lib/theme";

export const dynamic = "force-dynamic";

export async function GET() {
  const theme = await fetchTheme(NEST, true);
  if (!theme) return NextResponse.json({ message: "تم در دسترس نیست" }, { status: 503 });
  return NextResponse.json(theme, { headers: { "Cache-Control": "no-store" } });
}
