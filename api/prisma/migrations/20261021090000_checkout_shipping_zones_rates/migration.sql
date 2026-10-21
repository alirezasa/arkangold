-- ارسال سفارش: دفترچه‌ی آدرس (کد استان، پلاک/واحد، حذف نرم)، شرکت‌های حمل، مناطق و تعرفه‌های ارسال،
-- انتخاب روش ارسال و هزینه/پس‌کرایه هنگام ثبت سفارش و snapshot نشانی تحویل روی سفارش

-- CreateEnum
CREATE TYPE "ShippingFeePayment" AS ENUM ('PREPAID', 'ON_DELIVERY', 'CUSTOMER_CHOICE');

-- DropIndex
DROP INDEX "addresses_user_id_idx";

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "shipment_weight_grams" DECIMAL(18,2),
ADD COLUMN     "shipping_address" JSONB,
ADD COLUMN     "shipping_carrier_name" TEXT,
ADD COLUMN     "shipping_estimate_rial" DECIMAL(18,0),
ADD COLUMN     "shipping_eta_max_days" INTEGER,
ADD COLUMN     "shipping_eta_min_days" INTEGER,
ADD COLUMN     "shipping_method_id" UUID,
ADD COLUMN     "shipping_method_name" TEXT,
ADD COLUMN     "shipping_method_type" "ShippingMethodType",
ADD COLUMN     "shipping_pay_on_delivery" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "shipping_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN     "shipping_waived_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN     "shipping_zone_name" TEXT;

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "plaque" TEXT,
ADD COLUMN     "province_code" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "shipping_methods" ADD COLUMN     "available_at_checkout" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "carrier_id" UUID,
ADD COLUMN     "pickup_address" TEXT,
ADD COLUMN     "pickup_hours" TEXT,
ADD COLUMN     "requires_postal_code" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "shipping_carriers" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "contact_phone" TEXT,
    "tracking_url_template" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_zones" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "province_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_rates" (
    "id" UUID NOT NULL,
    "method_id" UUID NOT NULL,
    "zone_id" UUID NOT NULL,
    "base_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "base_weight_grams" INTEGER NOT NULL DEFAULT 1000,
    "step_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "step_weight_grams" INTEGER NOT NULL DEFAULT 1000,
    "value_percent" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "min_rial" DECIMAL(18,0),
    "max_rial" DECIMAL(18,0),
    "free_above_rial" DECIMAL(18,0),
    "max_weight_grams" INTEGER,
    "max_order_rial" DECIMAL(18,0),
    "fee_payment" "ShippingFeePayment" NOT NULL DEFAULT 'PREPAID',
    "eta_min_days" INTEGER,
    "eta_max_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shipping_carriers_code_key" ON "shipping_carriers"("code");

-- CreateIndex
CREATE INDEX "shipping_rates_zone_id_idx" ON "shipping_rates"("zone_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipping_rates_method_id_zone_id_key" ON "shipping_rates"("method_id", "zone_id");

-- CreateIndex
CREATE INDEX "shop_orders_shipping_method_id_idx" ON "shop_orders"("shipping_method_id");

-- CreateIndex
CREATE INDEX "addresses_user_id_deleted_at_idx" ON "addresses"("user_id", "deleted_at");

-- AddForeignKey
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_shipping_method_id_fkey" FOREIGN KEY ("shipping_method_id") REFERENCES "shipping_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_methods" ADD CONSTRAINT "shipping_methods_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "shipping_carriers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_method_id_fkey" FOREIGN KEY ("method_id") REFERENCES "shipping_methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_rates" ADD CONSTRAINT "shipping_rates_zone_id_fkey" FOREIGN KEY ("zone_id") REFERENCES "shipping_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── داده‌ها ──

-- کد استاندارد استان برای آدرس‌های موجود (استان متنی؛ ی/ک عربی، آ و فاصله/نیم‌فاصله یکسان‌سازی می‌شوند)
UPDATE "addresses" SET "province_code" = CASE
  regexp_replace(
    regexp_replace(translate(coalesce("province", ''), 'يكآأإ', 'یکااا'), '^\s*استان\s*', ''),
    '[\s‌]+', '', 'g'
  )
    WHEN 'تهران' THEN 'TEHRAN'
    WHEN 'البرز' THEN 'ALBORZ'
    WHEN 'اصفهان' THEN 'ESFAHAN'
    WHEN 'فارس' THEN 'FARS'
    WHEN 'خراسانرضوی' THEN 'KHORASAN_RAZAVI'
    WHEN 'اذربایجانشرقی' THEN 'AZARBAYJAN_SHARGHI'
    WHEN 'اذربایجانغربی' THEN 'AZARBAYJAN_GHARBI'
    WHEN 'اردبیل' THEN 'ARDABIL'
    WHEN 'ایلام' THEN 'ILAM'
    WHEN 'بوشهر' THEN 'BUSHEHR'
    WHEN 'چهارمحالوبختیاری' THEN 'CHAHARMAHAL_BAKHTIARI'
    WHEN 'خراسانجنوبی' THEN 'KHORASAN_JONUBI'
    WHEN 'خراسانشمالی' THEN 'KHORASAN_SHOMALI'
    WHEN 'خوزستان' THEN 'KHUZESTAN'
    WHEN 'زنجان' THEN 'ZANJAN'
    WHEN 'سمنان' THEN 'SEMNAN'
    WHEN 'سیستانوبلوچستان' THEN 'SISTAN_BALUCHESTAN'
    WHEN 'قزوین' THEN 'QAZVIN'
    WHEN 'قم' THEN 'QOM'
    WHEN 'کردستان' THEN 'KORDESTAN'
    WHEN 'کرمان' THEN 'KERMAN'
    WHEN 'کرمانشاه' THEN 'KERMANSHAH'
    WHEN 'کهگیلویهوبویراحمد' THEN 'KOHGILUYEH_BOYERAHMAD'
    WHEN 'گلستان' THEN 'GOLESTAN'
    WHEN 'گیلان' THEN 'GILAN'
    WHEN 'لرستان' THEN 'LORESTAN'
    WHEN 'مازندران' THEN 'MAZANDARAN'
    WHEN 'مرکزی' THEN 'MARKAZI'
    WHEN 'هرمزگان' THEN 'HORMOZGAN'
    WHEN 'همدان' THEN 'HAMEDAN'
    WHEN 'یزد' THEN 'YAZD'
    ELSE NULL
  END
WHERE "province_code" IS NULL AND "province" IS NOT NULL;

-- snapshot نشانی تحویل سفارش‌های موجود از روی آدرس فعلی
UPDATE "shop_orders" o SET "shipping_address" = jsonb_build_object(
    'id', a."id",
    'title', a."title",
    'province', a."province",
    'provinceCode', a."province_code",
    'city', a."city",
    'postalCode', a."postal_code",
    'fullAddress', a."full_address",
    'plaque', a."plaque",
    'unit', a."unit",
    'receiverName', a."receiver_name",
    'receiverPhone', a."receiver_phone"
  )
FROM "addresses" a
WHERE a."id" = o."address_id" AND o."shipping_address" IS NULL;
