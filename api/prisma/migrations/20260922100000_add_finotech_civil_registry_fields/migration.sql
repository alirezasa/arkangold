-- داده رسمی ثبت احوال که سرویس «استعلام اطلاعات هویتی» فینوتک برمی‌گرداند، حالا
-- در همان جدول user_identities ذخیره می‌شود تا پرونده هویتی بر اساس داده رسمی
-- (نه فقط اظهار کاربر) تکمیل شود.
ALTER TABLE "user_identities" ADD COLUMN "father_name" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "gender" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "death_status" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "identity_no" INTEGER;
ALTER TABLE "user_identities" ADD COLUMN "identity_seri" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "identity_serial" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "office_name" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "office_code" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "civil_registry_tracking_code" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "provider_request_id" TEXT;
ALTER TABLE "user_identities" ADD COLUMN "verified_by_provider" TEXT;
