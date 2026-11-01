// app/app/brand/font/[slot]/route.ts
//
// فونت سفارشی (پنل مدیریت ← ظاهر، رنگ و فونت) از همین مبدأ تا CSP (font-src 'self') رعایت شود.
import { NEST } from "@/app/api/_lib/proxy";
import { serveBrandFont } from "@/app/lib/theme";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slot: string }> }) {
  return serveBrandFont(NEST, (await params).slot);
}
