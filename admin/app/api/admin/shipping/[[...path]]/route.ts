// admin/app/api/admin/shipping/[[...path]]/route.ts
// پروکسی catch-all به /admin/shipping (شرکت‌های حمل، مناطق، تعرفه‌ها و شبیه‌ساز هزینه‌ی ارسال)
import { catchAll } from "@/app/lib/forward";

const handlers = catchAll("/admin/shipping");
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
