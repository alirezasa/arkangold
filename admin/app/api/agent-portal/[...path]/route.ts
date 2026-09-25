// admin/app/api/agent-portal/[...path]/route.ts
// پرتال نماینده — همه‌ی مسیرها با نشست همان حساب نماینده به API ارسال می‌شود
import { forward } from "../../admin/agents/_proxy";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  return forward(req, "/agent-portal", (await params).path, "GET");
}

export async function POST(req: Request, { params }: Ctx) {
  return forward(req, "/agent-portal", (await params).path, "POST");
}
