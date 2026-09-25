-- بسته‌بندی ارسال کالا: طرح‌های بسته‌بندی، اختصاص به محصول، انتخاب در سبد و snapshot در سفارش
-- DropIndex
DROP INDEX "cart_items_cart_id_variant_id_key";

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "packaging_option_id" UUID;

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "packaging_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN     "packaging_waived_rial" DECIMAL(18,0) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "shop_order_items" ADD COLUMN     "packaging_free" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "packaging_name" TEXT,
ADD COLUMN     "packaging_option_id" UUID,
ADD COLUMN     "packaging_quantity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "packaging_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN     "packaging_unit_price_rial" DECIMAL(18,0);

-- CreateTable
CREATE TABLE "packaging_options" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "image_url" TEXT,
    "price_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "per_unit" BOOLEAN NOT NULL DEFAULT true,
    "free_eligible" BOOLEAN NOT NULL DEFAULT true,
    "free_threshold_rial" DECIMAL(18,0),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packaging_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_packaging_options" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "packaging_option_id" UUID NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_packaging_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packaging_options_code_key" ON "packaging_options"("code");

-- CreateIndex
CREATE INDEX "packaging_options_is_active_sort_order_idx" ON "packaging_options"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "product_packaging_options_packaging_option_id_idx" ON "product_packaging_options"("packaging_option_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_packaging_options_product_id_packaging_option_id_key" ON "product_packaging_options"("product_id", "packaging_option_id");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_variant_id_idx" ON "cart_items"("cart_id", "variant_id");

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_packaging_option_id_fkey" FOREIGN KEY ("packaging_option_id") REFERENCES "packaging_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packaging_options" ADD CONSTRAINT "product_packaging_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_packaging_options" ADD CONSTRAINT "product_packaging_options_packaging_option_id_fkey" FOREIGN KEY ("packaging_option_id") REFERENCES "packaging_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_packaging_option_id_fkey" FOREIGN KEY ("packaging_option_id") REFERENCES "packaging_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

