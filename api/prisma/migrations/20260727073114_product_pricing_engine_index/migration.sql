-- AlterTable
ALTER TABLE "shop_order_items" ADD COLUMN     "price_breakdown" JSONB;

-- CreateIndex
CREATE INDEX "cart_items_price_expires_at_idx" ON "cart_items"("price_expires_at");
