// admin/app/api/admin/agents/[...path]/route.ts
import { forward } from "../_proxy";

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  return forward(req, "/admin/agents", (await params).path, "GET");
}

export async function POST(req: Request, { params }: Ctx) {
  return forward(req, "/admin/agents", (await params).path, "POST");
}

export async function PATCH(req: Request, { params }: Ctx) {
  return forward(req, "/admin/agents", (await params).path, "PATCH");
}
