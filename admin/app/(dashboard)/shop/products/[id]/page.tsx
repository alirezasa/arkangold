// admin/app/(dashboard)/shop/products/[id]/page.tsx
"use client";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Loader2, AlertCircle } from "lucide-react";
import { adminApi } from "@/app/core/api";
import ProductEditor, {
  ProductDetail,
} from "@/app/components/shop/ProductEditor";

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();

  const { data, error, isLoading, mutate } = useSWR<ProductDetail>(
    id ? `/api/admin/shop/products/${id}` : null,
    fetcher,
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-2xl">
        <div className="flex items-start gap-2 p-4 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          خطا در دریافت اطلاعات محصول
        </div>
      </div>
    );
  }

  return <ProductEditor id={id} data={data} mutate={mutate} />;
}
