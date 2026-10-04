// admin/app/api/admin/withdrawals/[[...path]]/route.ts — پروکسی catch-all به /admin/withdrawals
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/withdrawals");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
