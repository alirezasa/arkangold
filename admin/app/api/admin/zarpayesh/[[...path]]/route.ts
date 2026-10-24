// admin/app/api/admin/zarpayesh/[[...path]]/route.ts
// سامانه ناظر طلا (زر پایش): وضعیت، تنظیمات، اعتبارنامه، آزمون اتصال، معاملات، کاربران، ارسال‌ها و لاگ‌ها
import { forward } from "../../agents/_proxy";

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  return forward(req, "/admin/zarpayesh", (await params).path, "GET");
}

export async function POST(req: Request, { params }: Ctx) {
  return forward(req, "/admin/zarpayesh", (await params).path, "POST");
}

export async function PATCH(req: Request, { params }: Ctx) {
  return forward(req, "/admin/zarpayesh", (await params).path, "PATCH");
}
