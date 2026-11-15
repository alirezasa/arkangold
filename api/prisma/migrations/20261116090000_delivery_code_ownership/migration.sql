-- ثبت شمش به نام مالک فقط پس از تأیید کد تحویل (shop-orders/shop-order-fulfillment.service.ts)
--
-- هولوگرامی که به ردیف سفارش فروشگاه وصل می‌شود تا وقتی مشتری کد تحویل را ارائه/ثبت نکرده در وضعیت
-- AWAITING_DELIVERY می‌ماند و مالکیت ساخته نمی‌شود. کد تحویل: آرکان، یا برای تبدیل طلای آب‌شده به
-- شمش، کدی که سامانه ناظر (زر پایش) پیامک کرده است.

ALTER TYPE "HologramCodeStatus" ADD VALUE IF NOT EXISTS 'AWAITING_DELIVERY';

ALTER TABLE "shop_orders"
  ADD COLUMN IF NOT EXISTS "delivery_code_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "delivery_code_verified_via" TEXT;

-- سفارش‌هایی که پیش از این تغییر با کد تحویل تأیید شده‌اند
UPDATE "shop_orders" o
   SET "delivery_code_verified_at" = s."delivered_at",
       "delivery_code_verified_via" = s."delivery_confirmed_via"
  FROM "shippings" s
 WHERE s."shop_order_id" = o."id"
   AND o."status" = 'DELIVERED'
   AND o."delivery_code_verified_at" IS NULL
   AND s."delivery_confirmed_via" IN ('DELIVERY_CODE', 'COURIER_LINK');
