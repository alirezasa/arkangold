// admin/app/api/admin-auth/login/route.ts
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { errorResponse, sessionResponse } from "@/app/lib/adminSession";
import { portalFromHeaders } from "@/lib/portal";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    const response = await axios.post(`${NEST}/admin-auth/login`, {
      username: body.username,
      password: body.password,
      // درگاه از روی دامنه تعیین می‌شود: حساب نماینده فقط در panel.arkan.gold و کارشناسان فقط در admin.arkan.gold
      portal: portalFromHeaders(request.headers),
    });
    return sessionResponse(response.data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
