-- شماره شناسنامه‌ی متولدین جدید همان کد ملی ۱۰ رقمی است و در INT4 جا نمی‌شود
-- (خطای ۵۰۰ هنگام ذخیره‌ی پاسخ موفق استعلام فینوتک)؛ ستون به متن تبدیل می‌شود.
ALTER TABLE "user_identities" ALTER COLUMN "identity_no" TYPE TEXT USING "identity_no"::TEXT;
