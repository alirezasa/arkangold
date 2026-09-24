// admin/app/api/admin/discount-codes/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return adminProxy("/admin/discount-codes", {
    params: Object.fromEntries(searchParams.entries()),
  });
}

export async function POST(req: Request) {
  return adminProxy("/admin/discount-codes", {
    method: "POST",
    data: await req.json(),
  });
}
