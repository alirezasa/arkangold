// admin/app/api/admin/bank-accounts/[[...path]]/route.ts — پروکسی catch-all به /admin/bank-accounts
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/bank-accounts");
export const GET = handlers.GET;
export const POST = handlers.POST;
