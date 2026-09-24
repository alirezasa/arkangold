// admin/app/api/admin/discount-codes/generate/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return adminProxy("/admin/discount-codes/generate", {
    params: Object.fromEntries(searchParams.entries()),
  });
}
