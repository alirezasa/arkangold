-- FAU_GEN_EXT.1.5 (بند ۵): قفل موقت حساب کاربر عادی پس از تلاش‌های ناموفق مکرر ورود
ALTER TABLE "users" ADD COLUMN "failed_login_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMP(3);
