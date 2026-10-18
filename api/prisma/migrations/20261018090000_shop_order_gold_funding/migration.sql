-- تحویل فیزیکی طلای آب‌شده = خرید شمش موجود فروشگاه با کیف طلایی (+ مابه‌التفاوت ریالی/درگاه)

-- AlterEnum
ALTER TYPE "HoldType" ADD VALUE 'ORDER_GOLD';

-- AlterTable
ALTER TABLE "shop_orders" ADD COLUMN     "funding_source" TEXT,
ADD COLUMN     "gold_applied_grams" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN     "gold_applied_rial" DECIMAL(18,0) NOT NULL DEFAULT 0,
ADD COLUMN     "gold_rate_rial" DECIMAL(18,0);
