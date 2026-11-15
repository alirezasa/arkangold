// admin/app/api/admin/legal-profiles/documents/[id]/route.ts
// حذف یک مدرک حقوقی توسط کارشناس
import { adminProxy } from "@/app/lib/adminProxy";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return adminProxy(`/admin/legal-profiles/documents/${id}`, { method: "DELETE" });
}
