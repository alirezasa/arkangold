-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "discount_code_id" UUID,
ADD COLUMN     "discount_code_text" TEXT,
ADD COLUMN     "discount_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN     "subtotal_rial" DECIMAL(18,0);

-- Backfill: سفارش‌های قبلی تخفیفی نداشته‌اند، پس جمع اقلام = مبلغ نهایی
UPDATE "shop_orders" SET "subtotal_rial" = "total_rial" WHERE "subtotal_rial" IS NULL;

ALTER TABLE "shop_orders" ALTER COLUMN "subtotal_rial" SET NOT NULL;

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "max_discount_rial" DECIMAL(18,0),
    "min_order_rial" DECIMAL(18,0),
    "starts_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "usage_limit" INTEGER,
    "per_user_limit" INTEGER DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "user_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes"("code");

-- CreateIndex
CREATE INDEX "discount_codes_user_id_idx" ON "discount_codes"("user_id");

-- CreateIndex
CREATE INDEX "discount_codes_is_active_expires_at_idx" ON "discount_codes"("is_active", "expires_at");

-- CreateIndex
CREATE INDEX "shop_orders_discount_code_id_idx" ON "shop_orders"("discount_code_id");

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

