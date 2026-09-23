-- فعال/غیرفعال کردن دسته‌بندی محصولات فروشگاه
ALTER TABLE "product_categories" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;

-- مشخصات فنی ساختاریافته محصول (ابعاد، وزن، کد GTIN، کشور سازنده، برند و ...)
ALTER TABLE "products" ADD COLUMN "specifications" JSONB;
