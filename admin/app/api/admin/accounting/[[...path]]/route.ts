// admin/app/api/admin/accounting/[[...path]]/route.ts — پروکسی catch-all به /admin/accounting
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/accounting");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
