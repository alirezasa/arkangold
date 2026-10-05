// استعلام آزمایشی یک سرویس (شاهکار / تطبیق کارت / کارت به شبا) با Provider فعال
import { adminProxy } from "@/app/lib/adminProxy";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return adminProxy(
    `/admin/integrations/services/${encodeURIComponent(code)}/test`,
    { method: "POST", data: body },
  );
}
