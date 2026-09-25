// admin/app/api/admin/agents/route.ts
import { forward } from "./_proxy";

export async function GET(req: Request) {
  return forward(req, "/admin/agents", [], "GET");
}

export async function POST(req: Request) {
  return forward(req, "/admin/agents", [], "POST");
}
