-- CreateEnum
CREATE TYPE "ShippingMethodType" AS ENUM ('POST', 'COURIER', 'EXPRESS', 'PICKUP');

-- AlterTable
ALTER TABLE "shippings" ADD COLUMN     "courier_name" TEXT,
ADD COLUMN     "courier_phone" TEXT,
ADD COLUMN     "courier_token_expires_at" TIMESTAMP(3),
ADD COLUMN     "courier_token_hash" TEXT,
ADD COLUMN     "delivered_by_admin_id" UUID,
ADD COLUMN     "delivery_code_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "delivery_code_enc" TEXT,
ADD COLUMN     "delivery_code_sent_at" TIMESTAMP(3),
ADD COLUMN     "delivery_confirmed_via" TEXT,
ADD COLUMN     "delivery_note" TEXT,
ADD COLUMN     "received_by_name" TEXT,
ADD COLUMN     "shipped_by_admin_id" UUID,
ADD COLUMN     "shipping_method_id" UUID;

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "admin_note" TEXT,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMP(3),
ADD COLUMN     "delivered_at" TIMESTAMP(3),
ADD COLUMN     "order_number" TEXT,
ADD COLUMN     "paid_at" TIMESTAMP(3),
ADD COLUMN     "processing_at" TIMESTAMP(3),
ADD COLUMN     "shipped_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "shipping_methods" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ShippingMethodType" NOT NULL,
    "description" TEXT,
    "tracking_url_template" TEXT,
    "requires_tracking_code" BOOLEAN NOT NULL DEFAULT false,
    "requires_delivery_code" BOOLEAN NOT NULL DEFAULT true,
    "courier_link_enabled" BOOLEAN NOT NULL DEFAULT false,
    "estimated_days" INTEGER,
    "contact_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop_order_status_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "ShopOrderStatus",
    "to_status" "ShopOrderStatus" NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shop_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_methods_code_key" ON "shipping_methods"("code");

-- CreateIndex
CREATE INDEX "shipping_methods_is_active_sort_order_idx" ON "shipping_methods"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "shop_order_status_history_order_id_created_at_idx" ON "shop_order_status_history"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "shippings_courier_token_hash_key" ON "shippings"("courier_token_hash");

-- CreateIndex
CREATE INDEX "shippings_shop_order_id_idx" ON "shippings"("shop_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shop_orders_order_number_key" ON "shop_orders"("order_number");

-- CreateIndex
CREATE INDEX "shop_orders_status_created_at_idx" ON "shop_orders"("status", "created_at");

-- AddForeignKey
ALTER TABLE "shippings" ADD CONSTRAINT "shippings_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_status_history" ADD CONSTRAINT "shop_order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- شماره سفارش برای سفارش‌های قبلی (سفارش‌های جدید شماره‌ی ترتیبی سالانه می‌گیرند)
UPDATE "shop_orders" SET "order_number" = 'SO-' || UPPER(SUBSTRING("id"::text, 1, 8)) WHERE "order_number" IS NULL;
