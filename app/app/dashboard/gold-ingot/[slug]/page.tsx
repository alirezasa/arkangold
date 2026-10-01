"use client";

import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import ProductDetailView from "@/app/dashboard/components/shop/ProductDetailView";

// جزئیات شمش — زیر مسیر gold-ingot تا دسترسی تابع خدمت «خرید شمش» بماند
// (مسیر /dashboard/shop پشت خدمت «زیورآلات» است و ممکن است غیرفعال باشد).
// لینک خرید سایت arkan.gold به همین صفحه می‌آید؛ ?variant= وزن انتخابی
// کاربر در سایت را از پیش انتخاب می‌کند.
function GoldIngotDetail() {
  const params = useParams<{ slug: string }>();
  const variantId = useSearchParams().get("variant");
  return (
    <ProductDetailView
      slug={params.slug}
      backHref="/dashboard/gold-ingot"
      initialVariantId={variantId}
    />
  );
}

export default function GoldIngotDetailPage() {
  return (
    <Suspense>
      <GoldIngotDetail />
    </Suspense>
  );
}
