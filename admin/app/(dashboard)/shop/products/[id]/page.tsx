"use client";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import ProductImagesManager from "@/app/components/shop/ProductImagesManager";
import {
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  ArrowRight,
  Pencil,
  Save,
  X,
} from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

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

interface ProductVariant {
  id: string;
  weightGrams: string;
  priceAdjustmentToman: string;
  finalPriceToman: string;
  stockQuantity: number;
  inStock: boolean;
  sku: string | null;
}

interface WeightRange {
  minWeightGrams: string;
  maxWeightGrams: string;
  stepGrams: string;
  pricePerGramToman: string;
}

interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  basePriceToman: string;
  status: "ACTIVE" | "INACTIVE" | "OUT_OF_STOCK";
  pricingMode: "FIXED" | "WEIGHT_RANGE";
  weightRange: WeightRange | null;
  category?: { id: string; name: string };
  variants: ProductVariant[];
}

interface CategoryItem {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "فعال" },
  { value: "INACTIVE", label: "غیرفعال" },
  { value: "OUT_OF_STOCK", label: "ناموجود" },
];

// ══════════════════════════════════════════
// ردیف تنوع با قابلیت ویرایش inline
// ══════════════════════════════════════════
function VariantRow({
  variant,
  onSaved,
  onDeleted,
}: {
  variant: ProductVariant;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [weightGrams, setWeightGrams] = useState(variant.weightGrams);
  const [priceAdjustment, setPriceAdjustment] = useState(
    variant.priceAdjustmentToman,
  );
  const [stockQuantity, setStockQuantity] = useState(
    String(variant.stockQuantity),
  );
  const [sku, setSku] = useState(variant.sku ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.patch(`/api/admin/shop/variants/${variant.id}`, {
        weightGrams: Number(weightGrams),
        priceAdjustment: Number(priceAdjustment || 0) * 10,
        stockQuantity: Number(stockQuantity || 0),
        sku: sku.trim() || undefined,
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره تغییرات"));
    } finally {
      setLoading(false);
    }
  };

  const remove = async () => {
    if (!confirm("این تنوع حذف شود؟")) return;
    setLoading(true);
    setError(null);
    try {
      await axios.delete(`/api/admin/shop/variants/${variant.id}`);
      onDeleted();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در حذف تنوع"));
      setLoading(false);
    }
  };

  if (editing) {
    return (
      <tr>
        <td colSpan={5} className="p-0">
          <div
            className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end p-3"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                وزن (گرم)
              </label>
              <input
                type="number"
                step="0.01"
                dir="ltr"
                value={weightGrams}
                onChange={(e) => setWeightGrams(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                اختلاف قیمت (ت)
              </label>
              <input
                type="number"
                dir="ltr"
                value={priceAdjustment}
                onChange={(e) => setPriceAdjustment(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                موجودی
              </label>
              <input
                type="number"
                dir="ltr"
                value={stockQuantity}
                onChange={(e) => setStockQuantity(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">SKU</label>
              <input
                dir="ltr"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
              />
            </div>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={save}
                disabled={loading}
                className="flex-1 h-9 rounded-lg text-white text-[12px] font-bold flex items-center justify-center gap-1 disabled:opacity-60"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          {error && (
            <p
              className="px-3 pb-2 text-[11px] text-red-600 font-bold"
              style={{ backgroundColor: "var(--color-bg-page)" }}
            >
              {error}
            </p>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td dir="ltr" className="text-left">
        {variant.weightGrams}
      </td>
      <td className="font-bold">
        {Number(variant.finalPriceToman).toLocaleString("fa-IR")} ت
      </td>
      <td>
        <span
          className="badge"
          style={{
            background: variant.stockQuantity > 0 ? "#dcfce7" : "#fee2e2",
            color: variant.stockQuantity > 0 ? "#16a34a" : "#dc2626",
          }}
        >
          {variant.stockQuantity.toLocaleString("fa-IR")} عدد
        </span>
      </td>
      <td dir="ltr" className="text-left text-gray-400">
        {variant.sku ?? "—"}
      </td>
      <td>
        <div className="flex gap-1.5">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={remove}
            disabled={loading}
            className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, mutate } = useSWR<ProductDetail>(
    id ? `/api/admin/shop/products/${id}` : null,
    fetcher,
  );
  const { data: categories } = useSWR<CategoryItem[]>(
    "/api/admin/shop/categories",
    fetcher,
  );

  // ── فرم اطلاعات پایه ──
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [basePriceToman, setBasePriceToman] = useState("");
  const [status, setStatus] = useState("ACTIVE");
  const [savingBase, setSavingBase] = useState(false);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [baseSaved, setBaseSaved] = useState(false);

  // ── فرم بازه‌وزنی ──
  const [minWeight, setMinWeight] = useState("");
  const [maxWeight, setMaxWeight] = useState("");
  const [weightStep, setWeightStep] = useState("");
  const [pricePerGramToman, setPricePerGramToman] = useState("");
  const [savingRange, setSavingRange] = useState(false);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [previewWeight, setPreviewWeight] = useState(1);

  // ── فرم افزودن تنوع جدید ──
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [newWeight, setNewWeight] = useState("");
  const [newAdjustment, setNewAdjustment] = useState("0");
  const [newStock, setNewStock] = useState("0");
  const [newSku, setNewSku] = useState("");
  const [addingVariant, setAddingVariant] = useState(false);
  const [addVariantError, setAddVariantError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setCategoryId(data.category?.id ?? "");
    setDescription(data.description ?? "");
    setBasePriceToman(data.basePriceToman);
    setStatus(data.status);
    if (data.weightRange) {
      setMinWeight(data.weightRange.minWeightGrams);
      setMaxWeight(data.weightRange.maxWeightGrams);
      setWeightStep(data.weightRange.stepGrams);
      setPricePerGramToman(data.weightRange.pricePerGramToman);
      setPreviewWeight(Number(data.weightRange.minWeightGrams));
    }
  }, [data]);

  const previewPriceToman = useMemo(() => {
    const p = Number(pricePerGramToman) || 0;
    return Math.round(p * previewWeight);
  }, [pricePerGramToman, previewWeight]);

  const saveBaseInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setBaseError(null);
    setBaseSaved(false);
    if (!name.trim()) return setBaseError("نام محصول را وارد کنید");
    if (!categoryId) return setBaseError("دسته‌بندی را انتخاب کنید");
    const basePriceRial = Number(basePriceToman) * 10;
    if (!basePriceToman || basePriceRial <= 0)
      return setBaseError("قیمت پایه معتبر وارد کنید");

    setSavingBase(true);
    try {
      await axios.patch(`/api/admin/shop/products/${id}`, {
        name: name.trim(),
        categoryId,
        description: description.trim() || undefined,
        basePriceRial,
        status,
      });
      setBaseSaved(true);
      await mutate();
      setTimeout(() => setBaseSaved(false), 2000);
    } catch (err) {
      setBaseError(getErrorMessage(err, "خطا در ذخیره تغییرات"));
    } finally {
      setSavingBase(false);
    }
  };

  const saveWeightRange = async (e: React.FormEvent) => {
    e.preventDefault();
    setRangeError(null);
    const min = Number(minWeight),
      max = Number(maxWeight),
      step = Number(weightStep);
    const pricePerGramRial = Number(pricePerGramToman) * 10;
    if (!min || !max || min >= max) return setRangeError("بازه وزن معتبر نیست");
    if (!step || step <= 0)
      return setRangeError("گام وزن باید بزرگتر از صفر باشد");
    if (!pricePerGramToman || pricePerGramRial <= 0)
      return setRangeError("قیمت هر گرم را وارد کنید");

    setSavingRange(true);
    try {
      await axios.patch(`/api/admin/shop/products/${id}`, {
        pricingMode: "WEIGHT_RANGE",
        minWeightGrams: min,
        maxWeightGrams: max,
        weightStepGrams: step,
        pricePerGramRial,
      });
      await mutate();
    } catch (err) {
      setRangeError(getErrorMessage(err, "خطا در ذخیره بازه وزن"));
    } finally {
      setSavingRange(false);
    }
  };

  const addVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddVariantError(null);
    if (!newWeight || Number(newWeight) <= 0)
      return setAddVariantError("وزن معتبر وارد کنید");
    setAddingVariant(true);
    try {
      await axios.post(`/api/admin/shop/products/${id}/variants`, {
        weightGrams: Number(newWeight),
        priceAdjustment: Number(newAdjustment || 0) * 10,
        stockQuantity: Number(newStock || 0),
        sku: newSku.trim() || undefined,
      });
      setNewWeight("");
      setNewAdjustment("0");
      setNewStock("0");
      setNewSku("");
      setShowAddVariant(false);
      await mutate();
    } catch (err) {
      setAddVariantError(getErrorMessage(err, "خطا در افزودن تنوع"));
    } finally {
      setAddingVariant(false);
    }
  };

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <Link
        href="/shop/products"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 mb-4 hover:text-gray-600"
      >
        <ArrowRight className="w-3.5 h-3.5" /> بازگشت به محصولات
      </Link>

      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-black text-gray-900">{data.name}</h1>
        <span className="text-[11px] text-gray-400" dir="ltr">
          /{data.slug}
        </span>
      </div>

      {/* ── اطلاعات پایه ── */}
      <form
        onSubmit={saveBaseInfo}
        className="rounded-2xl p-5 space-y-4 mb-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <h2 className="text-[13px] font-black text-gray-700">اطلاعات پایه</h2>

        {baseError && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {baseError}
          </div>
        )}
        {baseSaved && (
          <div className="p-3 rounded-xl bg-green-50 text-green-600 text-[13px] font-bold">
            تغییرات ذخیره شد ✓
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            نام محصول
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
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
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">توضیحات</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            قیمت پایه (تومان)
          </label>
          <input
            type="number"
            dir="ltr"
            value={basePriceToman}
            onChange={(e) => setBasePriceToman(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 text-left"
          />
        </div>

        <button
          type="submit"
          disabled={savingBase}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {savingBase ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            "ذخیره اطلاعات پایه"
          )}
        </button>
      </form>

      {/* ── بازه وزنی (فقط اگر پرایسینگ WEIGHT_RANGE باشه) ── */}
      <div className="mb-5">
        <ProductImagesManager productId={id} />
      </div>
      {data.pricingMode === "WEIGHT_RANGE" && (
        <form
          onSubmit={saveWeightRange}
          className="rounded-2xl p-5 space-y-4 mb-5"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h2 className="text-[13px] font-black text-gray-700">
            بازه وزن و قیمت‌گذاری
          </h2>

          {rangeError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              {rangeError}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400">
                حداقل وزن (گرم)
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
                حداکثر وزن (گرم)
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
              <label className="text-[10px] font-bold text-gray-400">
                گام (Step)
              </label>
              <input
                type="number"
                step="0.1"
                dir="ltr"
                value={weightStep}
                onChange={(e) => setWeightStep(e.target.value)}
                className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">
              قیمت هر گرم (تومان)
            </label>
            <input
              type="number"
              dir="ltr"
              value={pricePerGramToman}
              onChange={(e) => setPricePerGramToman(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 text-left"
            />
          </div>

          <div
            className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            <p className="text-[11px] font-bold text-gray-500">
              پیش‌نمایش تجربه کاربر نهایی
            </p>
            <input
              type="range"
              min={Number(minWeight) || 0}
              max={Number(maxWeight) || 1}
              step={Number(weightStep) || 0.1}
              value={previewWeight}
              onChange={(e) => setPreviewWeight(Number(e.target.value))}
              className="w-full accent-[var(--color-emerald)]"
            />
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>{minWeight || 0} گرم</span>
              <span className="font-black text-gray-800 text-[14px]">
                {previewWeight.toLocaleString("fa-IR")} گرم
              </span>
              <span>{maxWeight || 0} گرم</span>
            </div>
            <div className="text-center pt-2 border-t border-gray-200">
              <span className="text-[11px] text-gray-400">
                قیمت محاسبه‌شده:{" "}
              </span>
              <span
                className="text-[16px] font-black"
                style={{ color: "var(--color-emerald)" }}
              >
                {previewPriceToman.toLocaleString("fa-IR")} تومان
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingRange}
            className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {savingRange ? (
              <Loader2 className="w-5 h-5 animate-spin mx-auto" />
            ) : (
              "ذخیره بازه وزن"
            )}
          </button>
        </form>
      )}

      {/* ── تنوع‌ها و انبار (فقط اگر FIXED باشه) ── */}
      {data.pricingMode === "FIXED" && (
        <div
          className="rounded-2xl p-5"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-black text-gray-700">
              تنوع‌ها و انبار
            </h2>
            <button
              onClick={() => setShowAddVariant((s) => !s)}
              className="flex items-center gap-1 text-[12px] font-bold"
              style={{ color: "var(--color-emerald)" }}
            >
              <Plus className="w-3.5 h-3.5" /> افزودن تنوع
            </button>
          </div>

          {showAddVariant && (
            <form
              onSubmit={addVariant}
              className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end mb-4 p-3 rounded-xl"
              style={{ backgroundColor: "var(--color-bg-page)" }}
            >
              {addVariantError && (
                <div className="col-span-2 sm:col-span-5 flex items-start gap-2 p-2 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {addVariantError}
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">
                  وزن (گرم)
                </label>
                <input
                  type="number"
                  step="0.01"
                  dir="ltr"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">
                  اختلاف قیمت (ت)
                </label>
                <input
                  type="number"
                  dir="ltr"
                  value={newAdjustment}
                  onChange={(e) => setNewAdjustment(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">
                  موجودی
                </label>
                <input
                  type="number"
                  dir="ltr"
                  value={newStock}
                  onChange={(e) => setNewStock(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">
                  SKU
                </label>
                <input
                  dir="ltr"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                />
              </div>
              <button
                type="submit"
                disabled={addingVariant}
                className="h-9 rounded-lg text-white text-[12px] font-bold disabled:opacity-60"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {addingVariant ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  "ثبت"
                )}
              </button>
            </form>
          )}

          {data.variants.length === 0 ? (
            <p className="text-[12px] text-gray-400 text-center py-6">
              هنوز تنوعی ثبت نشده است
            </p>
          ) : (
            <table className="w-full admin-table">
              <thead>
                <tr>
                  <th>وزن (گرم)</th>
                  <th>قیمت نهایی</th>
                  <th>موجودی</th>
                  <th>SKU</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {data.variants.map((v) => (
                  <VariantRow
                    key={v.id}
                    variant={v}
                    onSaved={() => mutate()}
                    onDeleted={() => mutate()}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
