-- قفل نشست ادمین پس از عدم فعالیت: آخرین فعالیت واقعی کاربر در پنل

-- AlterTable
ALTER TABLE "admin_sessions" ADD COLUMN     "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
