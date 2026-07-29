"use client";

import { useMemo, useState } from "react";
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
  Scale,
  Info,
} from "lucide-react";
import { useProduct, useAddToCart, productImageUrl } from "@/app/hooks/useShop";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { product, loading } = useProduct(params.slug);
  const { loading: addLoading, error, setError, add } = useAddToCart();

  // ── حالت تنوع ثابت (FIXED) ──
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );

  // ── حالت بازه‌وزنی (WEIGHT_RANGE) ──
  const [weightGrams, setWeightGrams] = useState<number | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  const isWeightRange = product?.pricingMode === "WEIGHT_RANGE";

  const selectedVariant = useMemo(() => {
    if (!product || isWeightRange) return null;
    return (
      product.variants.find((v) => v.id === selectedVariantId) ??
      product.variants[0] ??
      null
    );
  }, [product, selectedVariantId, isWeightRange]);

  // مقدار وزن پیش‌فرض = حداقل بازه، فقط یک‌بار بعد از لود محصول
  const effectiveWeight =
    weightGrams ??
    (product?.weightRange ? Number(product.weightRange.minWeightGrams) : 0);

  const estimatedPriceToman =
    isWeightRange && product?.weightRange
      ? effectiveWeight * Number(product.weightRange.pricePerGramToman)
      : null;

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

  const images = product.images.length
    ? product.images
    : product.primaryImageUrl
      ? [
          {
            id: "primary",
            url: product.primaryImageUrl,
            altText: null,
            isPrimary: true,
          },
        ]
      : [];
  const activeImage = images[activeImageIdx] ?? images[0];

  const handleAdd = async () => {
    setError(null);

    if (isWeightRange) {
      if (!product.weightRange) return setError("این محصول قابل خرید نیست");
      const min = Number(product.weightRange.minWeightGrams);
      const max = Number(product.weightRange.maxWeightGrams);
      if (!effectiveWeight || effectiveWeight < min || effectiveWeight > max) {
        return setError(`وزن باید بین ${min} تا ${max} گرم باشد`);
      }
      const res = await add({
        productId: product.id,
        weightGrams: effectiveWeight,
        quantity,
      });
      if (res) {
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
      }
      return;
    }

    if (!selectedVariant) return setError("یک تنوع را انتخاب کنید");
    if (!selectedVariant.inStock) return setError("این تنوع موجود نیست");
    const res = await add({ variantId: selectedVariant.id, quantity });
    if (res) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2000);
    }
  };

  const canAdd = isWeightRange ? !!effectiveWeight : !!selectedVariant?.inStock;

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
        {/* ── گالری تصاویر ── */}
        <div className="space-y-3">
          <div className="aspect-square bg-gray-50 rounded-3xl flex items-center justify-center text-rose-300 border border-gray-100 overflow-hidden">
            {activeImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={productImageUrl(activeImage.url) ?? undefined}
                alt={activeImage.altText ?? product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Gem className="w-24 h-24" strokeWidth={1} />
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImageIdx(i)}
                  className={`w-16 h-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    i === activeImageIdx ? "border-rose-500" : "border-gray-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={productImageUrl(img.url) ?? undefined}
                    alt={img.altText ?? ""}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {product.description && (
            <p className="text-[13px] text-gray-600 leading-relaxed">
              {product.description}
            </p>
          )}

          {/* ══ حالت بازه‌وزنی ══ */}
          {isWeightRange && product.weightRange && (
            <div className="space-y-3">
              <label className="text-[12px] font-bold text-gray-500 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                وزن مورد نظر (گرم)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step={product.weightRange.stepGrams}
                  min={product.weightRange.minWeightGrams}
                  max={product.weightRange.maxWeightGrams}
                  value={effectiveWeight || ""}
                  onChange={(e) => {
                    setWeightGrams(Number(e.target.value));
                    if (error) setError(null);
                  }}
                  dir="ltr"
                  className="w-full px-4 py-3.5 rounded-xl text-[16px] font-black border-2 border-gray-200 outline-none focus:border-rose-400 text-left"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-gray-400">
                  گرم
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                بازه مجاز: {product.weightRange.minWeightGrams} تا{" "}
                {product.weightRange.maxWeightGrams} گرم — گام:{" "}
                {product.weightRange.stepGrams} گرم
              </p>

              {estimatedPriceToman !== null && (
                <div className="bg-gray-50 rounded-2xl p-4 space-y-1">
                  <p className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    قیمت تقریبی (بدون احتساب اجرت/سود/مالیات)
                  </p>
                  <p className="text-[20px] font-black text-gray-800">
                    {fmtToman(estimatedPriceToman)}
                    <span className="text-[12px] font-bold text-gray-400 mr-1.5">
                      تومان
                    </span>
                  </p>
                  <p className="text-[10px] text-gray-400">
                    قیمت نهایی و دقیق هنگام افزودن به سبد محاسبه می‌شود
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══ حالت تنوع ثابت ══ */}
          {!isWeightRange && (
            <>
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
                        (selectedVariant?.id ?? product.variants[0]?.id) ===
                        v.id
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
                    {selectedVariant.stockQuantity.toLocaleString("fa-IR")} عدد
                    در انبار
                  </p>
                </div>
              )}
            </>
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
                    isWeightRange
                      ? q + 1
                      : Math.min(selectedVariant?.stockQuantity ?? 1, q + 1),
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
            disabled={addLoading || !canAdd}
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
