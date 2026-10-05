import { proxy } from "@/app/api/_lib/proxy";

export async function POST() {
  return proxy("/users/me/mobile-verification/recheck", { method: "POST" });
}
