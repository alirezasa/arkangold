-- پی‌رول ریالی: مبلغ ریالی پلن در هر اجرا با قیمت لحظه‌ای به طلا (دقت میلی‌گرم) تبدیل می‌شود
CREATE TYPE "PayrollAmountType" AS ENUM ('GRAMS', 'RIAL');

ALTER TABLE "payroll_plans" ADD COLUMN "amount_type" "PayrollAmountType" NOT NULL DEFAULT 'GRAMS';
ALTER TABLE "payroll_plans" ADD COLUMN "amount_rial" DECIMAL(20,0);

ALTER TABLE "payroll_logs" ADD COLUMN "price_per_gram_rial" DECIMAL(20,0);
ALTER TABLE "payroll_logs" ADD COLUMN "grams_per_user" DECIMAL(18,4);
