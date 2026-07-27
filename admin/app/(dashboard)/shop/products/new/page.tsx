// admin/app/(dashboard)/shop/products/new/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/app/core/api";
import { Loader2 } from "lucide-react";

export default function NewProductRedirect() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi
      .post("/api/admin/shop/products/draft")
      .then((res) => router.replace(`/shop/products/${res.data.id}`))
      .catch(() => setError("خطا در ایجاد محصول جدید"));
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      {error && <p className="text-red-600 text-[12px] font-bold">{error}</p>}
    </div>
  );
}