// admin/app/api/admin/deposits/[[...path]]/route.ts — پروکسی catch-all به /admin/deposits
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/deposits");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
