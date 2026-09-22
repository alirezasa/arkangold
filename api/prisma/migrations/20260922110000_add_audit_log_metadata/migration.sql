-- الزام FAU_GEN_EXT.1.1 (رویدادنگاری امنیتی): تکمیل فراداده‌ی رویدادها با
-- فیلدهای source (کجا)، success (نتیجه عملیات) و actor_label (شناسه‌ی ادعاشده
-- در تلاش‌های ناموفق احراز هویت، پیش از شناسایی هویت معتبر).

-- audit_logs (رویدادهای کاربران عادی)
ALTER TABLE "audit_logs" ADD COLUMN "source" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "audit_logs" ADD COLUMN "actor_label" TEXT;

-- admin_audit_logs (رویدادهای پنل ادمین)
ALTER TABLE "admin_audit_logs" ADD COLUMN "source" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "success" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "admin_audit_logs" ADD COLUMN "actor_label" TEXT;

-- در تلاش ناموفق ورود با نام کاربری نامعتبر، هنوز شناسه‌ی ادمین معتبر شناخته نشده است
ALTER TABLE "admin_audit_logs" ALTER COLUMN "admin_user_id" DROP NOT NULL;
