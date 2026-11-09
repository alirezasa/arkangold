-- کارمزد خرید/فروش طلای هر کاربر (fees/user-fee-override.ts)
--
-- هنگام ثبت‌نام نرخ تنظیمات سیستم در fee_configs کاربر ذخیره می‌شود و از این پس معامله با آخرین
-- ردیف فعال کاربر محاسبه می‌شود (قبلاً این ردیف‌ها ساخته می‌شد ولی خوانده نمی‌شد).
-- کاربرانی که ردیف فعال ندارند، نرخ فعلی تنظیمات سیستم را می‌گیرند (پیش‌فرض ۱٪).
-- ردیف‌های موجود (۱٪ هنگام ثبت‌نام) دست نمی‌خورند.

INSERT INTO "fee_configs" ("id", "type", "fee_percent", "is_active", "updated_at", "user_id")
SELECT gen_random_uuid(), t."type"::"FeeType",
       COALESCE(
         (SELECT ROUND(sc."value"::numeric, 2) FROM "system_configs" sc
           WHERE sc."key" = t."key" AND sc."value" ~ '^[0-9]+(\.[0-9]+)?$'),
         1.00),
       true, CURRENT_TIMESTAMP, u."id"
FROM "users" u
CROSS JOIN (VALUES ('BUY_GOLD', 'fee.buy_gold'), ('SELL_GOLD', 'fee.sell_gold')) AS t("type", "key")
WHERE NOT EXISTS (
  SELECT 1 FROM "fee_configs" f
  WHERE f."user_id" = u."id" AND f."type"::text = t."type" AND f."is_active" = true
);

-- جست‌وجوی کارمزد کاربر در هر قفل قیمت
CREATE INDEX IF NOT EXISTS "fee_configs_user_id_type_is_active_idx" ON "fee_configs"("user_id", "type", "is_active");
