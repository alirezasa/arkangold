"use client";

import { useParams } from "next/navigation";
import ProductDetailView from "@/app/dashboard/components/shop/ProductDetailView";

// جزئیات شمش — زیر مسیر gold-ingot تا دسترسی تابع خدمت «خرید شمش» بماند
// (مسیر /dashboard/shop پشت خدمت «زیورآلات» است و ممکن است غیرفعال باشد)
export default function GoldIngotDetailPage() {
  const params = useParams<{ slug: string }>();
  return (
    <ProductDetailView slug={params.slug} backHref="/dashboard/gold-ingot" />
  );
}
