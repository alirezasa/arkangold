import { adminProxy } from "@/app/lib/adminProxy";

// خروج اضطراری دونفره (FTA_TSE_EXT.3.5)
export async function POST(req: Request) {
  return adminProxy("/admin/security/sessions/emergency/request", {
    method: "POST",
    data: await req.json().catch(() => ({})),
  });
}
