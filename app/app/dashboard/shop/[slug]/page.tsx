"use client";

import { useParams } from "next/navigation";
import ProductDetailView from "@/app/dashboard/components/shop/ProductDetailView";

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  return <ProductDetailView slug={params.slug} backHref="/dashboard/shop" />;
}
