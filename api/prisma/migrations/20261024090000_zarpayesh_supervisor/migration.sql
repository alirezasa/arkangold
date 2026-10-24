-- سامانه ناظر بر خرید و فروش بر خط طلا و نقره (زر پایش): تنظیمات اتصال (پیش‌فرض خاموش)، ثبت کاربران سکو،
-- معاملات گزارش‌شده (Reserve/Approve/Cancel)، ارسال/تحویل دارایی و لاگ کامل فراخوانی‌ها

-- شناسه‌ی یکتای سمت پلتفرم (srcTrackingNumber) برای معاملات و ارسال‌ها
CREATE SEQUENCE "zarpayesh_src_tracking_seq" AS BIGINT START WITH 1000000001 INCREMENT BY 1;
-- CreateEnum
CREATE TYPE "ZarPayeshUserStatus" AS ENUM ('PENDING', 'REGISTERED', 'FAILED');

-- CreateEnum
CREATE TYPE "ZarPayeshTradeStatus" AS ENUM ('RESERVING', 'RESERVED', 'APPROVED', 'CANCELLED', 'FAILED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "zarpayesh_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "base_url" TEXT NOT NULL DEFAULT 'http://api.rpmms.ir',
    "timeout_ms" INTEGER NOT NULL DEFAULT 15000,
    "type_id" BIGINT,
    "type_title" TEXT,
    "vault_id" BIGINT,
    "vault_title" TEXT,
    "buy_pay_type" INTEGER NOT NULL DEFAULT 11,
    "sell_pay_type" INTEGER NOT NULL DEFAULT 11,
    "unit_price_basis" TEXT NOT NULL DEFAULT 'GRAM',
    "auto_register_users" BOOLEAN NOT NULL DEFAULT true,
    "connection_verified_at" TIMESTAMP(3),
    "last_test_at" TIMESTAMP(3),
    "last_test_result" JSONB,
    "enabled_at" TIMESTAMP(3),
    "enabled_by_admin_id" UUID,
    "updated_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zarpayesh_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zarpayesh_users" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "ZarPayeshUserStatus" NOT NULL DEFAULT 'PENDING',
    "registered_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "fk_city" INTEGER NOT NULL DEFAULT 0,
    "last_error_code" TEXT,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zarpayesh_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zarpayesh_trades" (
    "id" UUID NOT NULL,
    "src_tracking_number" BIGINT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ORDER',
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "price_lock_id" UUID,
    "order_type" INTEGER NOT NULL,
    "type_id" BIGINT NOT NULL,
    "vault_id" BIGINT NOT NULL,
    "amount_mg" DECIMAL(18,0) NOT NULL,
    "unit_price" DECIMAL(24,4) NOT NULL,
    "total_price" DECIMAL(18,0) NOT NULL,
    "pay_type" INTEGER,
    "rrn" TEXT,
    "description" TEXT,
    "reserve_code" BIGINT,
    "reserve_expire_at" TIMESTAMP(3),
    "reference_number" BIGINT,
    "vault_balance" DECIMAL(24,4),
    "remote_status" INTEGER,
    "status" "ZarPayeshTradeStatus" NOT NULL DEFAULT 'RESERVING',
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "error_code" TEXT,
    "error_message" TEXT,
    "review_note" TEXT,
    "reserved_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "last_followup_at" TIMESTAMP(3),
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zarpayesh_trades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zarpayesh_deliveries" (
    "id" UUID NOT NULL,
    "src_tracking_number" BIGINT NOT NULL,
    "user_id" UUID NOT NULL,
    "type_id" BIGINT NOT NULL,
    "amount_mg" DECIMAL(18,0) NOT NULL,
    "description" TEXT,
    "reference" TEXT,
    "tracking_code" BIGINT,
    "requested_at" TIMESTAMP(3),
    "remote_status" INTEGER,
    "state" TEXT NOT NULL DEFAULT 'REQUESTING',
    "approved_at" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "created_by_admin_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zarpayesh_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zarpayesh_api_logs" (
    "id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "http_method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "request_body" JSONB,
    "response_body" JSONB,
    "http_status" INTEGER,
    "success" BOOLEAN NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "duration_ms" INTEGER NOT NULL,
    "src_tracking_number" BIGINT,
    "user_id" UUID,
    "admin_id" UUID,
    "trigger" TEXT NOT NULL DEFAULT 'SYSTEM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zarpayesh_api_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "zarpayesh_users_user_id_key" ON "zarpayesh_users"("user_id");

-- CreateIndex
CREATE INDEX "zarpayesh_users_status_idx" ON "zarpayesh_users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "zarpayesh_trades_src_tracking_number_key" ON "zarpayesh_trades"("src_tracking_number");

-- CreateIndex
CREATE UNIQUE INDEX "zarpayesh_trades_order_id_key" ON "zarpayesh_trades"("order_id");

-- CreateIndex
CREATE INDEX "zarpayesh_trades_user_id_created_at_idx" ON "zarpayesh_trades"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "zarpayesh_trades_status_created_at_idx" ON "zarpayesh_trades"("status", "created_at");

-- CreateIndex
CREATE INDEX "zarpayesh_trades_needs_review_idx" ON "zarpayesh_trades"("needs_review");

-- CreateIndex
CREATE UNIQUE INDEX "zarpayesh_deliveries_src_tracking_number_key" ON "zarpayesh_deliveries"("src_tracking_number");

-- CreateIndex
CREATE UNIQUE INDEX "zarpayesh_deliveries_tracking_code_key" ON "zarpayesh_deliveries"("tracking_code");

-- CreateIndex
CREATE INDEX "zarpayesh_deliveries_user_id_created_at_idx" ON "zarpayesh_deliveries"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "zarpayesh_api_logs_created_at_idx" ON "zarpayesh_api_logs"("created_at");

-- CreateIndex
CREATE INDEX "zarpayesh_api_logs_method_created_at_idx" ON "zarpayesh_api_logs"("method", "created_at");

-- CreateIndex
CREATE INDEX "zarpayesh_api_logs_success_created_at_idx" ON "zarpayesh_api_logs"("success", "created_at");

-- CreateIndex
CREATE INDEX "zarpayesh_api_logs_src_tracking_number_idx" ON "zarpayesh_api_logs"("src_tracking_number");

-- CreateIndex
CREATE INDEX "zarpayesh_api_logs_user_id_created_at_idx" ON "zarpayesh_api_logs"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "zarpayesh_users" ADD CONSTRAINT "zarpayesh_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zarpayesh_trades" ADD CONSTRAINT "zarpayesh_trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zarpayesh_deliveries" ADD CONSTRAINT "zarpayesh_deliveries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ردیف ثابت تنظیمات — اتصال پیش‌فرض غیرفعال است
INSERT INTO "zarpayesh_config" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;
