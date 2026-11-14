"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { decimalOnly } from "@/app/utils/digits";
import Link from "next/link";
import {
  ChevronRight,
  Gem,
  Minus,
  Plus,
  ShoppingCart,
  AlertCircle,
  Loader2,
  Scale,
  Info,
  Package,
  Gift,
  ShieldCheck,
  BadgeCheck,
  ReceiptText,
  ChevronDown,
  ListChecks,
  FileText,
} from "lucide-react";
import {
  useProduct,
  useAddToCart,
  usePricingPreview,
  productImageUrl,
} from "@/app/hooks/useShop";
import { ProductText } from "@/app/dashboard/components/shop/ProductText";
import RichContent from "@/app/dashboard/components/shop/RichContent";
import AddedToCartModal from "@/app/dashboard/components/shop/AddedToCartModal";
import CartButton from "@/app/dashboard/components/shop/CartButton";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

const GOLD_INGOT_CATEGORY_SLUG = "gold-ingot";

const PRICE_PANEL_BG =
  "linear-gradient(145deg, #5a0d15 0%, var(--color-emerald) 70%)";

// تیتر بخش‌های پایین صفحه (مشخصات / توضیحات)
function SectionCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 sm:p-6">
      <div className="flex items-center gap-2.5 pb-3 mb-4 border-b border-gray-100">
        <span className="w-9 h-9 rounded-xl bg-gold-50 text-gold-600 flex items-center justify-center shrink-0">
          {icon}
        </span>
        <h2 className="text-[15px] sm:text-[16px] font-black text-gray-800">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function DetailSkeleton() {
  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 animate-pulse" dir="rtl">
      <div className="h-10 w-2/3 rounded-xl bg-white" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="aspect-square rounded-3xl bg-white" />
        <div className="h-96 rounded-3xl bg-white" />
      </div>
      <div className="h-48 rounded-3xl bg-white" />
    </div>
  );
}

/**
 * صفحه جزئیات محصول — مشترک بین فروشگاه زیورآلات و خرید شمش.
 * backHref مسیر بازگشت را تعیین می‌کند تا کاربر به همان بخشی برگردد که از آن آمده.
 */
export default function ProductDetailView({
  slug,
  backHref,
  initialVariantId = null,
}: {
  slug: string;
  backHref: string;
  /** تنوع پیش‌انتخاب (مثلاً وزنی که کاربر در سایت arkan.gold انتخاب کرده) */
  initialVariantId?: string | null;
}) {
  const { product, loading } = useProduct(slug);
  const { loading: addLoading, error, setError, add } = useAddToCart();

  // ── حالت تنوع ثابت (FIXED) ──
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    initialVariantId,
  );

  // ── حالت بازه‌وزنی (WEIGHT_RANGE) ──
  const [weightGrams, setWeightGrams] = useState<number | null>(null);
  // متن خام ورودی وزن (تا تایپ «۱٫» یا «0.» در میانه‌ی ورود از بین نرود)
  const [weightText, setWeightText] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  // بسته‌بندی انتخابی؛ null = گزینه پیش‌فرض محصول
  const [packagingId, setPackagingId] = useState<string | null>(null);
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

  // وزن فعال: یا ورودی بازه‌وزنی، یا وزنِ تنوعِ انتخاب‌شده
  const activeWeight = isWeightRange
    ? effectiveWeight
    : Number(selectedVariant?.weightGrams ?? 0);

  // اگر محصول فرمول قیمت‌گذاری زنده دارد، قیمت واقعی را از سرور بگیر
  const { preview, loading: previewLoading } = usePricingPreview(
    product?.hasPricingFormula ? product.slug : null,
    activeWeight,
  );

  // نوار خرید چسبان موبایل فقط وقتی کاربر از دکمه‌ی اصلی خرید رد شده
  // (مشغول خواندن مشخصات/توضیحات است)؛ بالای صفحه چیزی را نمی‌پوشاند
  const ctaRef = useRef<HTMLButtonElement>(null);
  const [ctaPassed, setCtaPassed] = useState(false);
  const productReady = !!product;
  useEffect(() => {
    const el = ctaRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) =>
      setCtaPassed(!entry.isIntersecting && entry.boundingClientRect.top < 0),
    );
    io.observe(el);
    return () => io.disconnect();
  }, [productReady]);

  if (loading) return <DetailSkeleton />;

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <Gem className="w-12 h-12 text-gray-300" strokeWidth={1.2} />
        <p className="text-[14px] font-bold text-gray-400">محصول یافت نشد</p>
        <Link
          href={backHref}
          className="text-[12px] font-bold text-gold-600 underline underline-offset-4"
        >
          بازگشت به فهرست
        </Link>
      </div>
    );
  }

  const packagingOptions = product.packagingOptions ?? [];
  const selectedPackaging =
    packagingOptions.find((o) => o.id === packagingId) ??
    packagingOptions.find((o) => o.isDefault) ??
    packagingOptions[0] ??
    null;
  const packagingCostToman = selectedPackaging
    ? Number(selectedPackaging.priceToman) *
      (selectedPackaging.perUnit ? quantity : 1)
    : 0;

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
        packagingOptionId: selectedPackaging?.id,
      });
      if (res) setAdded(true);
      return;
    }

    if (!selectedVariant) return setError("یک تنوع را انتخاب کنید");
    if (!selectedVariant.inStock) return setError("این تنوع موجود نیست");
    const res = await add({
      variantId: selectedVariant.id,
      quantity,
      packagingOptionId: selectedPackaging?.id,
    });
    if (res) setAdded(true);
  };

  const canAdd = isWeightRange ? !!effectiveWeight : !!selectedVariant?.inStock;
  const isIngot = product.category?.slug === GOLD_INGOT_CATEGORY_SLUG;
  const outOfStock = !isWeightRange && !!selectedVariant && !selectedVariant.inStock;

  // قیمت واحد: تنوع ثابت قیمت خودش را دارد؛ بازه‌وزنی از محاسبه‌ی لحظه‌ای سرور
  const priceLoading =
    !selectedVariant && !!product.hasPricingFormula && (previewLoading || !preview);
  const unitPrice: number | null = selectedVariant
    ? Number(selectedVariant.finalPriceToman)
    : preview
      ? Number(preview.finalPriceToman)
      : null;
  const showFormulaTotal =
    !!preview &&
    (unitPrice === null ||
      Math.round(Number(preview.finalPriceToman)) !== Math.round(unitPrice));

  const addButtonLabel = outOfStock ? "ناموجود" : "افزودن به سبد خرید";

  return (
    <div
      className="w-full max-w-5xl mx-auto space-y-5 animate-in fade-in duration-500"
      dir="rtl"
    >
      {/* ── سربرگ ── */}
      <div className="flex items-center gap-3">
        <Link
          href={backHref}
          aria-label="بازگشت"
          className="w-10 h-10 shrink-0 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors shadow-sm"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-gray-400 truncate">
            {product.category?.name ?? "فروشگاه"}
          </p>
          <p className="text-[14px] font-black text-gray-800 truncate">
            {product.name}
          </p>
        </div>
        <CartButton />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:items-start">
        {/* ── گالری تصاویر ── */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-3 space-y-3 lg:sticky lg:top-0">
          <div
            className="relative aspect-square rounded-2xl flex items-center justify-center text-gold-500 overflow-hidden"
            style={{
              background:
                "radial-gradient(circle at 50% 35%, var(--color-gold-50) 0%, #f6f3ea 70%)",
            }}
          >
            {activeImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={productImageUrl(activeImage.url) ?? undefined}
                alt={activeImage.altText ?? product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <Gem className="w-24 h-24 opacity-60" strokeWidth={1} />
            )}
            {isIngot && (
              <span
                className="absolute top-3 right-3 flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black shadow-sm"
                style={{
                  background: PRICE_PANEL_BG,
                  color: "var(--color-gold-500)",
                }}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                پلمپ امنیتی
              </span>
            )}
            {images.length > 1 && (
              <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
                {(activeImageIdx + 1).toLocaleString("fa-IR")} /{" "}
                {images.length.toLocaleString("fa-IR")}
              </span>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveImageIdx(i)}
                  aria-label={`تصویر ${i + 1}`}
                  aria-pressed={i === activeImageIdx}
                  className={`w-16 h-16 sm:w-[72px] sm:h-[72px] shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    i === activeImageIdx
                      ? "border-gold-500 shadow-sm"
                      : "border-transparent opacity-70 hover:opacity-100"
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

        {/* ── اطلاعات و خرید ── */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 sm:p-6 space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {product.category?.name && (
                <span className="rounded-full bg-gold-50 px-2.5 py-1 text-[10px] font-black text-gold-900">
                  {product.category.name}
                </span>
              )}
              {preview?.purityKarat && (
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-black text-gray-600">
                  عیار {preview.purityKarat === "K18" ? "۱۸" : "۲۴"}
                </span>
              )}
              {!isWeightRange && selectedVariant && (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                    selectedVariant.inStock
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {selectedVariant.inStock ? "موجود" : "ناموجود"}
                </span>
              )}
            </div>
            <h1 className="text-[20px] sm:text-[24px] font-black text-gray-900 leading-relaxed">
              {product.name}
            </h1>
            <ProductText
              text={product.shortDescription}
              className="text-[13px] text-gray-500 leading-loose"
            />
          </div>

          {/* ══ حالت بازه‌وزنی ══ */}
          {isWeightRange && product.weightRange && (
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-gray-500 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                وزن مورد نظر (گرم)
              </label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={weightText ?? (effectiveWeight ? String(effectiveWeight) : "")}
                  onChange={(e) => {
                    const v = decimalOnly(e.target.value);
                    setWeightText(v);
                    setWeightGrams(v ? Number(v) : 0);
                    if (error) setError(null);
                  }}
                  dir="ltr"
                  className="w-full py-3.5 pr-4 pl-14 rounded-xl text-[16px] font-black border-2 border-gray-200 outline-none focus:border-gold-500 text-left"
                />
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[12px] font-bold text-gray-400">
                  گرم
                </span>
              </div>
              <p className="text-[11px] text-gray-400">
                بازه مجاز: {product.weightRange.minWeightGrams} تا{" "}
                {product.weightRange.maxWeightGrams} گرم — گام:{" "}
                {product.weightRange.stepGrams} گرم
              </p>
            </div>
          )}

          {/* ══ حالت تنوع ثابت ══ */}
          {!isWeightRange && product.variants.length > 0 && (
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-gray-500 flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5" />
                وزن / تنوع
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                {product.variants.map((v) => {
                  const isActive =
                    (selectedVariant?.id ?? product.variants[0]?.id) === v.id;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVariantId(v.id);
                        setQuantity(1);
                      }}
                      disabled={!v.inStock}
                      aria-pressed={isActive}
                      className={`py-2.5 px-1 rounded-xl text-[12px] font-black border-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                        isActive
                          ? "border-gold-500 bg-gold-50 text-gold-900 shadow-sm"
                          : "border-gray-200 text-gray-600 hover:border-gray-300"
                      }`}
                    >
                      {Number(v.weightGrams).toLocaleString("fa-IR")} گرم
                      {!v.inStock && (
                        <span className="block text-[10px] font-bold text-gray-400 mt-0.5">
                          ناموجود
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ قیمت ══ */}
          {(unitPrice !== null || priceLoading) && (
            <div
              className="rounded-2xl p-4 sm:p-5 text-white"
              style={{ background: PRICE_PANEL_BG }}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-white/60 mb-1">
                    قیمت نهایی
                    {product.hasPricingFormula && " (لحظه‌ای)"}
                  </p>
                  {unitPrice !== null ? (
                    <p
                      className="text-[24px] sm:text-[28px] font-black leading-none"
                      style={{ color: "var(--color-gold-500)" }}
                    >
                      {fmtToman(unitPrice)}
                      <span className="text-[12px] font-bold text-white/60 mr-1.5">
                        تومان
                      </span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-[12px] text-white/70 py-1.5">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      در حال محاسبه قیمت لحظه‌ای...
                    </p>
                  )}
                </div>
                {selectedVariant && selectedVariant.inStock && (
                  <p className="shrink-0 text-[11px] font-bold text-white/60">
                    {selectedVariant.stockQuantity.toLocaleString("fa-IR")} عدد
                    در انبار
                  </p>
                )}
              </div>
              {unitPrice !== null && quantity > 1 && (
                <p className="mt-3 pt-3 border-t border-white/10 flex justify-between text-[12px] font-bold text-white/80">
                  <span>جمع {quantity.toLocaleString("fa-IR")} عدد</span>
                  <span>{fmtToman(unitPrice * quantity)} تومان</span>
                </p>
              )}
            </div>
          )}

          {/* ══ جزئیات فرمول قیمت‌گذاری (فقط اگر محصول عیار طلا + فرمول دارد) ══ */}
          {product.hasPricingFormula && preview && (
            <details className="group rounded-2xl border border-gray-100 bg-gray-50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-[12px] font-bold text-gray-600 [&::-webkit-details-marker]:hidden">
                <span className="flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-gold-600" />
                  جزئیات محاسبه قیمت (عیار{" "}
                  {preview.purityKarat === "K18" ? "۱۸" : "۲۴"})
                </span>
                <ChevronDown className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 px-4 pb-4">
                {preview.goldPricePerGramToman && (
                  <div className="flex justify-between gap-3 text-[12px] text-gray-500">
                    <span>قیمت هر گرم طلا</span>
                    <span>{fmtToman(preview.goldPricePerGramToman)} تومان</span>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-[12px] text-gray-500">
                  <span>ارزش پایه طلا</span>
                  <span>{fmtToman(preview.goldValueToman)} تومان</span>
                </div>
                {preview.lines.map((line) => (
                  <div
                    key={line.key}
                    className="flex justify-between gap-3 text-[12px] text-gray-500"
                  >
                    <span>{line.label}</span>
                    <span>{fmtToman(line.amountToman)} تومان</span>
                  </div>
                ))}
                {showFormulaTotal && (
                  <div className="flex justify-between gap-3 pt-2 border-t border-gray-200 text-[13px] font-black text-gray-800">
                    <span>قیمت طبق فرمول</span>
                    <span>{fmtToman(preview.finalPriceToman)} تومان</span>
                  </div>
                )}
              </div>
            </details>
          )}

          <div className="flex items-center justify-between gap-3">
            <label className="text-[12px] font-bold text-gray-500">تعداد</label>
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 p-1">
              <button
                type="button"
                aria-label="کاهش تعداد"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center text-[15px] font-black text-gray-800">
                {quantity.toLocaleString("fa-IR")}
              </span>
              <button
                type="button"
                aria-label="افزایش تعداد"
                onClick={() =>
                  setQuantity((q) =>
                    isWeightRange
                      ? q + 1
                      : Math.min(selectedVariant?.stockQuantity ?? 1, q + 1),
                  )
                }
                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-100"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* ══ انتخاب بسته‌بندی ارسال ══ */}
          {packagingOptions.length > 0 && (
            <div className="space-y-2">
              <label className="text-[12px] font-bold text-gray-500 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" />
                بسته‌بندی ارسال
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {packagingOptions.map((o) => {
                  const active = selectedPackaging?.id === o.id;
                  const price = Number(o.priceToman);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setPackagingId(o.id)}
                      aria-pressed={active}
                      className={`flex items-start gap-3 p-2.5 rounded-xl border-2 text-right transition-all ${
                        active
                          ? "border-gold-500 bg-gold-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="w-14 h-14 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                        {o.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={productImageUrl(o.imageUrl) ?? undefined}
                            alt={o.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Package className="w-6 h-6 text-gray-300" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[12px] font-black ${
                            active ? "text-gold-900" : "text-gray-800"
                          }`}
                        >
                          {o.name}
                        </p>
                        <p className="text-[11px] font-bold text-gray-500 mt-0.5">
                          {price > 0
                            ? `${fmtToman(price)} تومان${
                                o.perUnit ? " / هر عدد" : ""
                              }`
                            : "رایگان"}
                        </p>
                        {o.description && (
                          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">
                            {o.description}
                          </p>
                        )}
                        {price > 0 && o.freeThresholdToman && (
                          <p className="text-[10px] font-bold text-emerald-600 mt-0.5 flex items-center gap-1">
                            <Gift className="w-3 h-3 shrink-0" />
                            رایگان برای خرید بالای{" "}
                            {fmtToman(o.freeThresholdToman)} تومان
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {packagingCostToman > 0 && (
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  هزینه بسته‌بندی: {fmtToman(packagingCostToman)} تومان — در سبد
                  خرید و فاکتور به‌صورت ردیف جدا محاسبه می‌شود
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            ref={ctaRef}
            type="button"
            onClick={handleAdd}
            disabled={addLoading || !canAdd}
            className="w-full py-4 rounded-2xl text-[14px] font-black text-white flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-40 shadow-[0_10px_24px_rgba(51,5,9,0.22)]"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {addLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <ShoppingCart className="w-5 h-5" />
                {addButtonLabel}
              </>
            )}
          </button>

          {/* ══ نشان‌های اطمینان (شمش) ══ */}
          {isIngot && (
            <div className="grid grid-cols-3 gap-2 pt-1">
              {(
                [
                  [ShieldCheck, "پلمپ امنیتی", "هولوگرام‌دار"],
                  [BadgeCheck, "طلای ۲۴ عیار", "شمش شرکتی"],
                  [ReceiptText, "فاکتور رسمی", "همراه سفارش"],
                ] as const
              ).map(([Icon, title, sub]) => (
                <div
                  key={title}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-gray-50 px-1.5 py-3 text-center"
                >
                  <Icon className="w-5 h-5 text-gold-600" strokeWidth={1.8} />
                  <span className="text-[11px] font-black text-gray-700">
                    {title}
                  </span>
                  <span className="text-[10px] text-gray-400">{sub}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── مشخصات فنی و توضیحات کامل (تمام‌عرض، زیر بخش خرید) ── */}
      {product.specifications.length > 0 && (
        <SectionCard icon={<ListChecks className="w-4.5 h-4.5" />} title="مشخصات فنی">
          <dl className="grid grid-cols-1 md:grid-cols-2 md:gap-x-8">
            {product.specifications.map((row, i) => (
              <div
                key={`${row.label}-${i}`}
                className="flex items-baseline gap-3 py-2.5 border-b border-dashed border-gray-200 text-[13px]"
              >
                <dt className="w-2/5 shrink-0 font-bold text-gray-400">
                  {row.label}
                </dt>
                <dd className="flex-1 min-w-0 font-bold text-gray-800 break-words">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      )}

      {product.description?.trim() && (
        <SectionCard icon={<FileText className="w-4.5 h-4.5" />} title="توضیحات محصول">
          <RichContent html={product.description} />
        </SectionCard>
      )}

      {/* ── نوار خرید چسبان موبایل (بالای منوی پایین) ── */}
      {ctaPassed && (
        // جای خالی هم‌ارتفاع نوار تا انتهای توضیحات زیر آن پنهان نماند
        <div className="lg:hidden h-16" aria-hidden="true" />
      )}
      {ctaPassed && (
        <div className="lg:hidden fixed inset-x-0 z-[70] px-3 bottom-[calc(6.4rem+max(env(safe-area-inset-bottom),12px))] animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div
            className="flex items-center gap-3 rounded-2xl border bg-white/95 p-2 pr-4 shadow-[0_10px_32px_rgba(51,5,9,0.16)] backdrop-blur-xl"
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-gray-400">قیمت نهایی</p>
              <p className="text-[15px] font-black text-gray-900 truncate">
                {unitPrice !== null ? (
                  <>
                    {fmtToman(unitPrice * quantity)}
                    <span className="text-[10px] font-bold text-gray-400 mr-1">
                      تومان
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={addLoading || !canAdd}
              className="shrink-0 px-4 py-3 rounded-xl text-[13px] font-black text-white flex items-center gap-2 disabled:opacity-40"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {addLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
              {addButtonLabel}
            </button>
          </div>
        </div>
      )}

      <AddedToCartModal
        open={added}
        productName={product.name}
        onClose={() => setAdded(false)}
      />
    </div>
  );
}
