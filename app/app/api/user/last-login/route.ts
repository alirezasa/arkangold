// FTA_TAH_EXT.1.1 — آخرین ورود موفق پیش از نشست فعلی
import { proxy } from "../../_lib/proxy";

export async function GET() {
  return proxy("/users/me/last-login");
}
