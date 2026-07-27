-- CreateEnum
CREATE TYPE "PricingComponentBase" AS ENUM ('GOLD_VALUE', 'RUNNING_TOTAL', 'FIXED');

-- CreateEnum
CREATE TYPE "PricingComponentValueType" AS ENUM ('PERCENT', 'FIXED_RIAL');

-- CreateEnum
CREATE TYPE "GoldPurityKarat" AS ENUM ('K18', 'K24');

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "locked_breakdown" JSONB,
ADD COLUMN     "locked_unit_price_rial" DECIMAL(18,0),
ADD COLUMN     "price_expires_at" TIMESTAMP(3),
ADD COLUMN     "price_locked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "meta_keywords" TEXT,
ADD COLUMN     "purity_karat" "GoldPurityKarat",
ADD COLUMN     "short_description" TEXT;

-- CreateTable
CREATE TABLE "pricing_components" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pricing_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_pricing_components" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "component_id" UUID NOT NULL,
    "base_type" "PricingComponentBase" NOT NULL,
    "value_type" "PricingComponentValueType" NOT NULL,
    "value" DECIMAL(18,4) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_pricing_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pricing_components_key_key" ON "pricing_components"("key");

-- CreateIndex
CREATE INDEX "product_pricing_components_product_id_sort_order_idx" ON "product_pricing_components"("product_id", "sort_order");

-- AddForeignKey
ALTER TABLE "product_pricing_components" ADD CONSTRAINT "product_pricing_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_pricing_components" ADD CONSTRAINT "product_pricing_components_component_id_fkey" FOREIGN KEY ("component_id") REFERENCES "pricing_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
