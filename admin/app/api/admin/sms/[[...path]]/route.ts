// admin/app/api/admin/sms/[[...path]]/route.ts — پروکسی catch-all به /admin/sms (مرکز پیامک)
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/sms");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
