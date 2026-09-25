// admin/app/api/admin/treasury/[[...path]]/route.ts — پروکسی catch-all به /admin/treasury
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/treasury");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
