// app/app/api/referrals/me/route.ts
import { proxy } from "../../_lib/proxy";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  return proxy("/referrals/me", {
    params: {
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
    },
  });
}
