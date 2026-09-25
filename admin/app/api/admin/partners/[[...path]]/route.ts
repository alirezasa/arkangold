// admin/app/api/admin/partners/[[...path]]/route.ts — پروکسی catch-all به /admin/partners
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/partners");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
