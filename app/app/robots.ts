import type { MetadataRoute } from "next";

// اپ کاربران (app.arkan.gold) در موتورهای جستجو نمایه می‌شود، اما فقط صفحات عمومی
// (ورود/ثبت‌نام)؛ داشبورد، API و فاکتورها حاوی داده‌ی کاربرند و نمایه نمی‌شوند.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/register", "/verify"],
      disallow: ["/dashboard", "/api/", "/invoice/", "/courier", "/forgot-password"],
    },
  };
}
