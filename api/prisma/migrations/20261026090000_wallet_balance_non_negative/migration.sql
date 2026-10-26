-- دفاع در عمق برای یکپارچگی مالی: موجودی ریالی و طلایی کیف پول کاربران هرگز منفی نمی‌شود
-- (همانند agent_wallets_balance_check کیف پول نمایندگان). هر خطای منطقی که بخواهد بیش از
-- موجودی برداشت کند، در سطح پایگاه داده رد می‌شود و کل تراکنش برمی‌گردد.
--
-- NOT VALID: ردیف‌های موجود هنگام اعمال بررسی نمی‌شوند تا استقرار در صورت وجود داده‌ی قدیمی
-- نادرست شکست نخورد؛ اما هر درج/به‌روزرسانی از این پس بررسی می‌شود. اگر هیچ موجودی منفی‌ای
-- وجود نداشته باشد، قید همین‌جا کامل اعتبارسنجی هم می‌شود.
ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_balance_non_negative"
  CHECK ("rial_balance" >= 0 AND "gold_balance_grams" >= 0) NOT VALID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "wallets" WHERE "rial_balance" < 0 OR "gold_balance_grams" < 0
  ) THEN
    ALTER TABLE "wallets" VALIDATE CONSTRAINT "wallets_balance_non_negative";
  ELSE
    RAISE WARNING 'wallets_balance_non_negative: کیف پول با موجودی منفی وجود دارد؛ پیش از VALIDATE اصلاح شود';
  END IF;
END $$;
