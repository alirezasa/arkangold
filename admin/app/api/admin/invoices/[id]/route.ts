// admin/app/api/admin/invoices/[id]/route.ts
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/invoices/${id}`);
}
