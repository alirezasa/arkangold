-- FAU_GEN_EXT.1.2: مهرهای زمانی رویدادهای امنیتی صریحاً UTC ذخیره شوند
-- (timestamp without time zone قبلی مبهم بود؛ مقادیر موجود UTC فرض می‌شوند)
ALTER TABLE "audit_logs" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3)
  USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "admin_audit_logs" ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3)
  USING "created_at" AT TIME ZONE 'UTC';

-- FAU_STG_EXT.1.2: زنجیره‌ی hash برای تشخیص دستکاری/حذف رویدادهای امنیتی
ALTER TABLE "audit_logs" ADD COLUMN "prev_hash" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "hash" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "prev_hash" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "hash" TEXT;

CREATE TABLE "audit_chain_state" (
  "id" TEXT NOT NULL,
  "last_hash" TEXT NOT NULL,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "audit_chain_state_pkey" PRIMARY KEY ("id")
);

-- رکورد آغازین (genesis) هر دو زنجیره؛ از این پس هر ردیف جدید با قفل ردیف
-- مربوطه (SELECT ... FOR UPDATE) به‌صورت اتمیک به زنجیره افزوده می‌شود
INSERT INTO "audit_chain_state" ("id", "last_hash", "updated_at")
VALUES
  ('admin', REPEAT('0', 64), NOW()),
  ('user', REPEAT('0', 64), NOW());
