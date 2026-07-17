"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronRight,
  Gem,
  Minus,
  Plus,
  ShoppingCart,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { useProduct, useAddToCart } from "@/app/hooks/useShop";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { product, loading } = useProduct(params.slug);
  const { loading: addLoading, error, setError, add } = useAddToCart();

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-24">
        <p className="text-[14px] font-bold text-gray-400">محصول یافت نشد</p>
      </div>
    );
  }

  const selectedVariant =
    product.variants.find((v) => v.id === selectedVariantId) ??
    product.variants[0] ??
    null;

  const handleAdd = async () => {
    if (!selectedVariant) return setError("یک تنوع را انتخاب کنید");
    if (!selectedVariant.inStock) return setError("این تنوع موجود نیست");
    const res = await add(selectedVariant.id, quantity);
    if (res) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  };

  return (
    <div
      className="w-full max-w-4xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500"
      dir="rtl"
    >
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/shop"
          className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[18px] font-black text-gray-800">
            {product.name}
          </h1>
          <p className="text-[12px] text-gray-500 mt-0.5">
            {product.category?.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="aspect-square bg-gray-50 rounded-3xl flex items-center justify-center text-rose-300 border border-gray-100">
          <Gem className="w-24 h-24" strokeWidth={1} />
        </div>

        <div className="space-y-5">
          {product.description && (
            <p className="text-[13px] text-gray-600 leading-relaxed">
              {product.description}
            </p>
          )}

          <div className="space-y-2">
            <label className="text-[12px] font-bold text-gray-500">
              وزن / تنوع
            </label>
            <div className="grid grid-cols-3 gap-2">
              {product.variants.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  disabled={!v.inStock}
                  className={`py-3 rounded-xl text-[12px] font-bold border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    (selectedVariant?.id ?? product.variants[0]?.id) === v.id
                      ? "border-rose-500 bg-rose-50 text-rose-700"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {v.weightGrams} گرم
                  {!v.inStock && (
                    <span className="block text-[10px] text-gray-400 mt-0.5">
                      ناموجود
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {selectedVariant && (
            <div className="bg-gray-50 rounded-2xl p-4">
              <p className="text-[11px] text-gray-400 mb-1">قیمت نهایی</p>
              <p className="text-[22px] font-black text-gray-800">
                {fmtToman(selectedVariant.finalPriceToman)}
                <span className="text-[12px] font-bold text-gray-400 mr-1.5">
                  تومان
                </span>
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                {selectedVariant.stockQuantity.toLocaleString("fa-IR")} عدد در
                انبار
              </p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-[12px] font-bold text-gray-500">تعداد</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center text-[15px] font-black text-gray-800">
                {quantity.toLocaleString("fa-IR")}
              </span>
              <button
                onClick={() =>
                  setQuantity((q) =>
                    Math.min(selectedVariant?.stockQuantity ?? 1, q + 1),
                  )
                }
                className="w-10 h-10 rounded-xl border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleAdd}
            disabled={addLoading || !selectedVariant?.inStock}
            className="w-full py-4 rounded-xl text-[14px] font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-lg"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {addLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : added ? (
              <>
                <CheckCircle2 className="w-5 h-5" />
                افزوده شد
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                افزودن به سبد خرید
              </>
            )}
          </button>

          {added && (
            <button
              onClick={() => router.push("/dashboard/shop/cart")}
              className="w-full py-3 rounded-xl text-[13px] font-bold border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              مشاهده سبد خرید
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
