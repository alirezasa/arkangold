// admin/app/api/admin/legal-profiles/[userId]/documents/route.ts
// فهرست مدارک حقوقی کاربر
import { adminProxy } from "@/app/lib/adminProxy";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  return adminProxy(`/admin/legal-profiles/${userId}/documents`);
}
