-- AlterTable
ALTER TABLE "shippings" ADD COLUMN     "shop_order_id" UUID,
ALTER COLUMN "delivery_request_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "shippings" ADD CONSTRAINT "shippings_shop_order_id_fkey" FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shippings" ADD CONSTRAINT "chk_shipping_single_target"
  CHECK (
    (delivery_request_id IS NOT NULL AND shop_order_id IS NULL) OR
    (delivery_request_id IS NULL AND shop_order_id IS NOT NULL)
  );