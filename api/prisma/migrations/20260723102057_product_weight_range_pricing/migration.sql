-- CreateEnum
CREATE TYPE "ProductPricingMode" AS ENUM ('FIXED', 'WEIGHT_RANGE');

-- AlterTable
ALTER TABLE "cart_items" ADD COLUMN     "product_id" UUID,
ADD COLUMN     "selected_weight_grams" DECIMAL(18,4),
ALTER COLUMN "variant_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "max_weight_grams" DECIMAL(18,4),
ADD COLUMN     "min_weight_grams" DECIMAL(18,4),
ADD COLUMN     "price_per_gram_rial" DECIMAL(18,0),
ADD COLUMN     "pricing_mode" "ProductPricingMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN     "weight_step_grams" DECIMAL(18,4) DEFAULT 0.1;

-- AlterTable
ALTER TABLE "shop_order_items" ADD COLUMN     "product_id" UUID,
ADD COLUMN     "selected_weight_grams" DECIMAL(18,4),
ALTER COLUMN "variant_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
