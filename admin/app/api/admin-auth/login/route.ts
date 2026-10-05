// admin/app/api/admin-auth/login/route.ts
// مرحله‌ی اول ورود پنل (نام کاربری و رمز). پاسخ فقط مرحله‌ی بعد است: تغییر رمز موقت یا
// راه‌اندازی/بررسی برنامه‌ی احراز هویت؛ نشست در پایان مراحل (login/step) صادر می‌شود.
import axios from "axios";
import { NEST } from "@/app/lib/adminProxy";
import { errorResponse, loginStepOrSession } from "@/app/lib/adminSession";
import { portalFromHeaders } from "@/lib/portal";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      username?: unknown;
      password?: unknown;
      captcha?: unknown;
    };
    const response = await axios.post(`${NEST}/admin-auth/login`, {
      username: body.username,
      password: body.password,
      captcha: typeof body.captcha === "string" ? body.captcha : undefined,
      // درگاه از روی دامنه تعیین می‌شود: حساب نماینده فقط در panel.arkan.gold و کارشناسان فقط در admin.arkan.gold
      portal: portalFromHeaders(request.headers),
    });
    return loginStepOrSession(response.data);
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
