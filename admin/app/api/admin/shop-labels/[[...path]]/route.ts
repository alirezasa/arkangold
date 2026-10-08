// admin/app/api/admin/shop-labels/[[...path]]/route.ts
// پروکسی catch-all به /admin/shop-labels (طرح‌ها، اندازه‌ها، بارکد کالاها، تنظیمات و داده‌ی چاپ برچسب)
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/shop-labels");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
