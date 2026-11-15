-- اتصال «ارسال دارایی» سامانه ناظر (زر پایش) به سفارش تحویل شمش با طلای آب‌شده
-- (zarpayesh/zarpayesh-shop-order.service.ts)
--
-- پرداخت سفارش ← MakeDeliveries (سامانه ناظر کد تأیید را برای کاربر پیامک می‌کند)
-- ارسال ← SetDeliveries 2/3 — تحویل ← SetDeliveries 1 با همان کد — لغو ← SetDeliveries 4

ALTER TABLE "zarpayesh_deliveries"
  ADD COLUMN IF NOT EXISTS "shop_order_id" UUID,
  ADD COLUMN IF NOT EXISTS "skipped_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "skipped_by_admin_id" UUID,
  ADD COLUMN IF NOT EXISTS "skipped_at" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "zarpayesh_deliveries_shop_order_id_key"
  ON "zarpayesh_deliveries"("shop_order_id");

DO $$ BEGIN
  ALTER TABLE "zarpayesh_deliveries"
    ADD CONSTRAINT "zarpayesh_deliveries_shop_order_id_fkey"
    FOREIGN KEY ("shop_order_id") REFERENCES "shop_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- صادرکننده‌ی کد تحویل مرسوله: NULL = کد آرکان، ZARPAYESH = approveCode سامانه ناظر
ALTER TABLE "shippings" ADD COLUMN IF NOT EXISTS "delivery_code_source" TEXT;
