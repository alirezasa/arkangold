// admin/app/api/admin/inventory/[[...path]]/route.ts — پروکسی catch-all به /admin/inventory
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/inventory");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
