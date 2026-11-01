import { adminProxy } from "@/app/lib/adminProxy";

// تب «نشست و ارتباطات» پنل امنیت (FTA/FTP/FMT)
export async function GET() {
  return adminProxy("/admin/security/session-comm");
}
