// admin/app/components/shop/ProductEditor.tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import Link from "next/link";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  FileText,
  Search,
  Calculator,
  Image as ImageIcon,
  ExternalLink,
} from "lucide-react";
import { adminApi } from "@/app/core/api";
import ProductImagesManager from "./ProductImagesManager";
import PricingFormulaEditor from "./PricingFormulaEditor";
import ProductVariantsManager from "./ProductVariantsManager";

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (data?.message)
      return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

interface CategoryItem {
  id: string;
  name: string;
}
interface VariantItem {
  id: string;
  weightGrams: string;
  priceAdjustmentToman: string;
  finalPriceToman: string;
  stockQuantity: number;
  sku: string | null;
}
interface WeightRange {
  minWeightGrams: string;
  maxWeightGrams: string;
  stepGrams: string;
  pricePerGramToman: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  shortDescription?: string | null;
  metaKeywords?: string | null;
  seoTitle?: string | null;
  seoDesc?: string | null;
  basePriceToman: string;
  status: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
  pricingMode: "FIXED" | "WEIGHT_RANGE";
  purityKarat?: "K18" | "K24" | null;
  weightRange: WeightRange | null;
  category?: { id: string; name: string };
  variants: VariantItem[];
}

const STATUS_OPTIONS: Array<{ value: ProductDetail["status"]; label: string }> =
  [
    { value: "ACTIVE", label: "فعال" },
    { value: "INACTIVE", label: "غیرفعال (پیش‌نویس)" },
    { value: "OUT_OF_STOCK", label: "ناموجود" },
  ];

type TabKey = "basic" | "seo" | "pricing" | "gallery";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "basic", label: "اطلاعات پایه", icon: FileText },
  { key: "seo", label: "سئو", icon: Search },
  { key: "pricing", label: "فرمول قیمت", icon: Calculator },
  { key: "gallery", label: "گالری تصاویر", icon: ImageIcon },
];

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

export default function ProductEditor({
  id,
  data,
  mutate,
}: {
  id: string;
  data: ProductDetail;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutate: () => Promise<any>;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("basic");

  const { data: categories } = useSWR<CategoryItem[]>(
    "/api/admin/shop/categories",
    fetcher,
  );

  const isDraft = data.slug.startsWith("draft-") || !data.name;

  return (
    <div className="max-w-6xl">
      <Link
        href="/shop/products"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 mb-4 hover:text-gray-600"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        بازگشت به محصولات
      </Link>

      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-black text-gray-900">
            {isDraft ? "محصول جدید (پیش‌نویس)" : data.name}
          </h1>
          {!isDraft && (
            <span className="text-[11px] text-gray-400" dir="ltr">
              /{data.slug}
            </span>
          )}
        </div>
        {!isDraft && (
          <a // <--- این تگ در کد شما پاک شده بود
            href={`http://localhost:3000/shop/${data.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[12px] font-bold text-gray-400 hover:text-gray-600"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            مشاهده در فروشگاه
          </a>
        )}
      </div>

      {/* ── تب‌ها ── */}
      <div
        className="flex gap-1 mb-5 overflow-x-auto rounded-2xl p-1.5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-colors shrink-0"
              style={
                active
                  ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                  : { color: "#6b7280" }
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
      {/* ── لایه دو ستونه در دسکتاپ: محتوای اصلی + گالری کناری ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div>
          {tab === "basic" && (
            <>
              <BasicInfoTab
                id={id}
                data={data}
                categories={categories}
                mutate={mutate}
                onCreated={() => router.replace(`/shop/products/${id}`)}
              />
              {!isDraft && data.pricingMode === "FIXED" && (
                <div className="mt-6">
                  <ProductVariantsManager productId={id} />
                </div>
              )}
            </>
          )}
          {tab === "seo" && <SeoTab id={id} data={data} mutate={mutate} />}
          {tab === "pricing" && <PricingFormulaEditor productId={id} />}
          {tab === "gallery" && <ProductImagesManager productId={id} />}
        </div>

        {/* ── گالری همیشه در سایدبار دسکتاپ قابل مشاهده (مثل ووکامرس) ── */}
        <div className="hidden lg:block">
          <ProductImagesManager productId={id} />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// تب ۱: اطلاعات پایه (نام/دسته/توضیحات/قیمت/تنوع یا بازه‌وزنی)
// ══════════════════════════════════════════
function BasicInfoTab({
  id,
  data,
  categories,
  mutate,
  onCreated,
}: {
  id: string;
  data: ProductDetail;
  categories?: CategoryItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutate: () => Promise<any>;
  onCreated: () => void;
}) {
  const isDraft = data.slug.startsWith("draft-") || !data.name;

  const [name, setName] = useState(data.name);
  const [categoryId, setCategoryId] = useState(data.category?.id ?? "");
  const [shortDescription, setShortDescription] = useState(
    data.shortDescription ?? "",
  );
  const [description, setDescription] = useState(data.description ?? "");
  const [basePriceToman, setBasePriceToman] = useState(data.basePriceToman);
  const [status, setStatus] = useState<ProductDetail["status"]>(data.status);
  const [pricingMode, setPricingMode] = useState<"FIXED" | "WEIGHT_RANGE">(
    data.pricingMode,
  );

  // بازه‌وزنی
  const [minWeight, setMinWeight] = useState(
    data.weightRange?.minWeightGrams ?? "1",
  );
  const [maxWeight, setMaxWeight] = useState(
    data.weightRange?.maxWeightGrams ?? "5",
  );
  const [weightStep, setWeightStep] = useState(
    data.weightRange?.stepGrams ?? "0.5",
  );
  const [pricePerGramToman, setPricePerGramToman] = useState(
    data.weightRange?.pricePerGramToman ?? "",
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("نام محصول را وارد کنید");
    if (!categoryId) return setError("دسته‌بندی را انتخاب کنید");
    const basePriceRial = Number(basePriceToman) * 10;
    if (!basePriceToman || basePriceRial <= 0)
      return setError("قیمت پایه معتبر وارد کنید");

    const payload: Record<string, unknown> = {
      name: name.trim(),
      categoryId,
      description: description.trim() || undefined,
      shortDescription: shortDescription.trim() || undefined,
      basePriceRial,
      status,
      pricingMode,
    };

    if (pricingMode === "WEIGHT_RANGE") {
      const min = Number(minWeight),
        max = Number(maxWeight),
        step = Number(weightStep),
        pricePerGramRial = Number(pricePerGramToman) * 10;
      if (!min || !max || min >= max) return setError("بازه وزن معتبر نیست");
      if (!step || step <= 0)
        return setError("گام وزن باید بزرگتر از صفر باشد");
      if (!pricePerGramToman || pricePerGramRial <= 0)
        return setError("قیمت هر گرم را وارد کنید");
      Object.assign(payload, {
        minWeightGrams: min,
        maxWeightGrams: max,
        weightStepGrams: step,
        pricePerGramRial,
      });
    }

    setSaving(true);
    try {
      if (isDraft) {
        // اولین ذخیره: از PATCH استفاده می‌کنیم چون رکورد Draft از قبل ساخته شده
        await adminApi.patch(`/api/admin/shop/products/${id}`, payload);
        await mutate();
        onCreated();
      } else {
        await adminApi.patch(`/api/admin/shop/products/${id}`, payload);
        await mutate();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره تغییرات"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl p-5 space-y-4"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <h2 className="text-[13px] font-black text-gray-700">اطلاعات پایه</h2>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {saved && (
        <div className="p-3 rounded-xl bg-green-50 text-green-600 text-[13px] font-bold">
          تغییرات ذخیره شد ✓
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-[12px] font-bold text-gray-500">
            نام محصول
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
            placeholder="مثلاً دستبند طلای آب‌شده"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            دسته‌بندی
          </label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
          >
            <option value="">انتخاب کنید...</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">وضعیت</label>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as ProductDetail["status"])
            }
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          توضیح کوتاه (Excerpt — در کارت محصول و نتیجهٔ جستجو استفاده می‌شود)
        </label>
        <textarea
          value={shortDescription}
          onChange={(e) => setShortDescription(e.target.value)}
          rows={2}
          maxLength={200}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 resize-none"
        />
        <p className="text-[10px] text-gray-400 text-left" dir="ltr">
          {shortDescription.length}/200
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          توضیحات کامل محصول
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          قیمت پایه (تومان) — برای محصولات غیرطلایی، مبنای فرمول قیمت‌گذاری است
        </label>
        <input
          type="number"
          dir="ltr"
          value={basePriceToman}
          onChange={(e) => setBasePriceToman(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 text-left"
        />
      </div>

      {/* ── نوع قیمت‌گذاری ── */}
      <div className="space-y-2">
        <label className="text-[12px] font-bold text-gray-500">
          نوع قیمت‌گذاری
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPricingMode("FIXED")}
            className="p-3 rounded-xl border-2 text-[12px] font-bold text-center"
            style={{
              borderColor:
                pricingMode === "FIXED"
                  ? "var(--color-emerald)"
                  : "var(--color-border)",
              backgroundColor:
                pricingMode === "FIXED"
                  ? "var(--color-emerald-light)"
                  : "transparent",
            }}
          >
            تنوع‌های ثابت
          </button>
          <button
            type="button"
            onClick={() => setPricingMode("WEIGHT_RANGE")}
            className="p-3 rounded-xl border-2 text-[12px] font-bold text-center"
            style={{
              borderColor:
                pricingMode === "WEIGHT_RANGE"
                  ? "var(--color-emerald)"
                  : "var(--color-border)",
              backgroundColor:
                pricingMode === "WEIGHT_RANGE"
                  ? "var(--color-emerald-light)"
                  : "transparent",
            }}
          >
            بازه‌وزنی (اسلایدر)
          </button>
        </div>
      </div>

      {pricingMode === "WEIGHT_RANGE" && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl"
          style={{ backgroundColor: "var(--color-bg-page)" }}
        >
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400">
              حداقل (گرم)
            </label>
            <input
              type="number"
              step="0.1"
              dir="ltr"
              value={minWeight}
              onChange={(e) => setMinWeight(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400">
              حداکثر (گرم)
            </label>
            <input
              type="number"
              step="0.1"
              dir="ltr"
              value={maxWeight}
              onChange={(e) => setMaxWeight(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400">گام</label>
            <input
              type="number"
              step="0.1"
              dir="ltr"
              value={weightStep}
              onChange={(e) => setWeightStep(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400">
              قیمت هر گرم (ت)
            </label>
            <input
              type="number"
              dir="ltr"
              value={pricePerGramToman}
              onChange={(e) => setPricePerGramToman(e.target.value)}
              className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
            />
          </div>
        </div>
      )}

      

      <button
        type="submit"
        disabled={saving}
        className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {saving ? (
          <Loader2 className="w-5 h-5 animate-spin mx-auto" />
        ) : isDraft ? (
          "ایجاد محصول و ادامه"
        ) : (
          "ذخیره اطلاعات پایه"
        )}
      </button>
    </form>
  );
}



// ══════════════════════════════════════════
// تب ۲: سئو + پیش‌نمایش گوگل زنده
// ══════════════════════════════════════════
function SeoTab({
  id,
  data,
  mutate,
}: {
  id: string;
  data: ProductDetail;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutate: () => Promise<any>;
}) {
  const [seoTitle, setSeoTitle] = useState(data.seoTitle ?? data.name ?? "");
  const [seoDesc, setSeoDesc] = useState(
    data.seoDesc ?? data.shortDescription ?? "",
  );
  const [metaKeywords, setMetaKeywords] = useState(data.metaKeywords ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const previewUrl = `arkangold.com/shop/${data.slug || "product-slug"}`;
  const titleLen = seoTitle.length;
  const descLen = seoDesc.length;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await adminApi.patch(`/api/admin/shop/products/${id}`, {
        seoTitle: seoTitle.trim() || undefined,
        seoDesc: seoDesc.trim() || undefined,
        metaKeywords: metaKeywords.trim() || undefined,
      });
      await mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره سئو"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ── پیش‌نمایش زندهٔ گوگل ── */}
      <div
        className="rounded-2xl p-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h2 className="text-[13px] font-black text-gray-700 mb-3">
          پیش‌نمایش نتیجهٔ جستجوی گوگل
        </h2>
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: "#fff", border: "1px solid #dfe1e5" }}
          dir="ltr"
        >
          <p className="text-[13px] text-[#202124] mb-0.5 truncate">
            {previewUrl}
          </p>
          <p className="text-[18px] text-[#1a0dab] leading-tight truncate">
            {seoTitle || data.name || "عنوان محصول"}
          </p>
          <p className="text-[13px] text-[#4d5156] mt-0.5 line-clamp-2">
            {seoDesc || "توضیحات متا برای این محصول هنوز وارد نشده است."}
          </p>
        </div>
      </div>

      <form
        onSubmit={submit}
        className="rounded-2xl p-5 space-y-4"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {saved && (
          <div className="p-3 rounded-xl bg-green-50 text-green-600 text-[13px] font-bold">
            تنظیمات سئو ذخیره شد ✓
          </div>
        )}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-bold text-gray-500">
              عنوان سئو (Meta Title)
            </label>
            <span
              className={`text-[10px] ${titleLen > 60 ? "text-red-500" : "text-gray-400"}`}
              dir="ltr"
            >
              {titleLen}/60
            </span>
          </div>
          <input
            value={seoTitle}
            onChange={(e) => setSeoTitle(e.target.value)}
            maxLength={70}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
            placeholder="عنوانی جذاب و شامل کلمهٔ کلیدی اصلی"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-bold text-gray-500">
              توضیحات متا (Meta Description)
            </label>
            <span
              className={`text-[10px] ${descLen > 160 ? "text-red-500" : "text-gray-400"}`}
              dir="ltr"
            >
              {descLen}/160
            </span>
          </div>
          <textarea
            value={seoDesc}
            onChange={(e) => setSeoDesc(e.target.value)}
            rows={3}
            maxLength={180}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 resize-none"
            placeholder="خلاصه‌ای دو خطی که در نتایج گوگل نمایش داده می‌شود"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            کلمات کلیدی (با کاما جدا کنید)
          </label>
          <input
            value={metaKeywords}
            onChange={(e) => setMetaKeywords(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
            placeholder="طلا آب شده، دستبند طلا، خرید طلا"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {saving ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            "ذخیره تنظیمات سئو"
          )}
        </button>
      </form>
    </div>
  );
}
