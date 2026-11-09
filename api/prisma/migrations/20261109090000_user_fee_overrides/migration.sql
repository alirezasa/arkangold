-- کارمزد اختصاصی کاربر از پنل مدیریت
--
-- تا پیش از این، هنگام ثبت‌نام برای هر کاربر ردیف‌های BUY_GOLD/SELL_GOLD با ۱٪ در fee_configs ساخته
-- می‌شد که هیچ‌جا خوانده نمی‌شد (کارمزد واقعی از system_config بود). از این پس ردیف فعالِ کاربر
-- جایگزین نرخ پیش‌فرض سیستم می‌شود؛ پس ردیف‌های خودکار قبلی غیرفعال می‌شوند تا کارمزد هیچ کاربری
-- بدون تصمیم کارشناس تغییر نکند. (حذف نمی‌شوند؛ فقط is_active = false)
UPDATE "fee_configs" SET "is_active" = false WHERE "user_id" IS NOT NULL AND "is_active" = true;

-- جست‌وجوی کارمزد اختصاصی در هر قفل قیمت/برداشت
CREATE INDEX IF NOT EXISTS "fee_configs_user_id_type_is_active_idx" ON "fee_configs"("user_id", "type", "is_active");
