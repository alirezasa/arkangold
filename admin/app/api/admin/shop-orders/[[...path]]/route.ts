// admin/app/api/admin/shop-orders/[[...path]]/route.ts
// پروکسی catch-all به /admin/shop-orders (فهرست، جزئیات، ارسال، تحویل با کد، مراجع ارسال و ...)
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/shop-orders");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
