-- FTA_TSE_EXT.2.1 — زمان آخرین فعالیت نشست کاربر برای انقضا پس از عدم فعالیت
ALTER TABLE "user_sessions" ADD COLUMN "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
