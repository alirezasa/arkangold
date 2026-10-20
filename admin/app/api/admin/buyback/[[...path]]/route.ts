// admin/app/api/admin/buyback/[[...path]]/route.ts
// بازخرید شمش: فهرست، خلاصه، جزئیات و اقدامات (پذیرش، دریافت، اصالت‌سنجی، قیمت، تأیید، واریز، عودت)
import { forward } from "../../agents/_proxy";

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(req: Request, { params }: Ctx) {
  return forward(req, "/admin/buyback", (await params).path, "GET");
}

export async function POST(req: Request, { params }: Ctx) {
  return forward(req, "/admin/buyback", (await params).path, "POST");
}
