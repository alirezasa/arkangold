"use client";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  Plus,
  Trash2,
  AlertCircle,
  ArrowRight,
  Gauge,
  LayoutGrid,
} from "lucide-react";
import Link from "next/link";

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

interface CategoryItem {
  id: string;
  name: string;
}
interface VariantRow {
  weightGrams: string;
  priceAdjustment: string;
  stockQuantity: string;
  sku: string;
}
function emptyVariant(): VariantRow {
  return { weightGrams: "", priceAdjustment: "0", stockQuantity: "0", sku: "" };
}

type ProductType = "FIXED" | "WEIGHT_RANGE";

export default function NewProductPage() {
  const router = useRouter();
  const { data: categories } = useSWR<CategoryItem[]>(
    "/api/admin/shop/categories",
    fetcher,
  );

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [basePriceToman, setBasePriceToman] = useState("");
  const [productType, setProductType] = useState<ProductType>("FIXED");

  // ── حالت ساده (Fixed variants) ──
  const [variants, setVariants] = useState<VariantRow[]>([emptyVariant()]);

  // ── حالت متغیر بر اساس بازه‌وزنی (اسلایدر) ──
  const [minWeight, setMinWeight] = useState("1");
  const [maxWeight, setMaxWeight] = useState("5");
  const [weightStep, setWeightStep] = useState("0.5");
  const [pricePerGramToman, setPricePerGramToman] = useState("");
  const [previewWeight, setPreviewWeight] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewPriceToman = useMemo(() => {
    const p = Number(pricePerGramToman) || 0;
    return Math.round(p * previewWeight);
  }, [pricePerGramToman, previewWeight]);

  const updateVariant = (index: number, patch: Partial<VariantRow>) =>
    setVariants((rows) =>
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    );
  const addVariantRow = () => setVariants((rows) => [...rows, emptyVariant()]);
  const removeVariantRow = (index: number) =>
    setVariants((rows) =>
      rows.length > 1 ? rows.filter((_, i) => i !== index) : rows,
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("نام محصول را وارد کنید");
    if (!categoryId) return setError("دسته‌بندی را انتخاب کنید");
    const basePriceRial = Number(basePriceToman) * 10;
    if (!basePriceToman || basePriceRial <= 0)
      return setError("قیمت پایه معتبر وارد کنید");

    if (productType === "WEIGHT_RANGE") {
      const min = Number(minWeight),
        max = Number(maxWeight),
        step = Number(weightStep);
      const pricePerGramRial = Number(pricePerGramToman) * 10;
      if (!min || !max || min >= max)
        return setError("بازه وزن معتبر نیست (حداقل باید کمتر از حداکثر باشد)");
      if (!step || step <= 0)
        return setError("گام وزن باید بزرگتر از صفر باشد");
      if (!pricePerGramToman || pricePerGramRial <= 0)
        return setError("قیمت هر گرم را وارد کنید");
    }

    let cleanedVariants: {
      weightGrams: number;
      priceAdjustment: number;
      stockQuantity: number;
      sku?: string;
    }[] = [];
    if (productType === "FIXED") {
      cleanedVariants = variants
        .filter((v) => v.weightGrams.trim() !== "")
        .map((v) => ({
          weightGrams: Number(v.weightGrams),
          priceAdjustment: Number(v.priceAdjustment || 0) * 10,
          stockQuantity: Number(v.stockQuantity || 0),
          sku: v.sku.trim() || undefined,
        }));
      for (const v of cleanedVariants) {
        if (!v.weightGrams || v.weightGrams <= 0)
          return setError("وزن هر تنوع باید عددی بزرگتر از صفر باشد");
      }
    }

    setLoading(true);
    try {
      const productRes = await axios.post("/api/admin/shop/products", {
        name: name.trim(),
        categoryId,
        description: description.trim() || undefined,
        basePriceRial,
        pricingMode: productType,
        ...(productType === "WEIGHT_RANGE"
          ? {
              minWeightGrams: Number(minWeight),
              maxWeightGrams: Number(maxWeight),
              weightStepGrams: Number(weightStep),
              pricePerGramRial: Number(pricePerGramToman) * 10,
            }
          : {}),
      });
      const productId: string = productRes.data.id;

      if (productType === "FIXED") {
        for (const v of cleanedVariants) {
          await axios.post(`/api/admin/shop/products/${productId}/variants`, v);
        }
      }

      router.replace(`/shop/products/${productId}`);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ایجاد محصول"));
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Link
        href="/shop/products"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 mb-4 hover:text-gray-600"
      >
        <ArrowRight className="w-3.5 h-3.5" /> بازگشت به محصولات
      </Link>

      <h1 className="text-lg font-black text-gray-900 mb-5">
        ایجاد محصول جدید
      </h1>

      {error && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        {/* ── اطلاعات پایه ── */}
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h2 className="text-[13px] font-black text-gray-700">اطلاعات پایه</h2>
          <div className="space-y-1.5">
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
            <label className="text-[12px] font-bold text-gray-500">
              توضیحات (اختیاری)
            </label>
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
              placeholder="0"
            />
          </div>
        </div>

        {/* ── انتخاب نوع محصول (شبیه Simple/Variable ووکامرس) ── */}
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h2 className="text-[13px] font-black text-gray-700">نوع محصول</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setProductType("FIXED")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors"
              style={{
                borderColor:
                  productType === "FIXED"
                    ? "var(--color-emerald)"
                    : "var(--color-border)",
                backgroundColor:
                  productType === "FIXED"
                    ? "var(--color-emerald-light)"
                    : "transparent",
              }}
            >
              <LayoutGrid
                className="w-5 h-5"
                style={{ color: "var(--color-emerald)" }}
              />
              <span className="text-[12px] font-black text-gray-800">
                تنوع‌های ثابت
              </span>
              <span className="text-[10px] text-gray-400 text-center">
                مثل ۱ گرمی، ۲ گرمی با قیمت و موجودی جدا
              </span>
            </button>

            <button
              type="button"
              onClick={() => setProductType("WEIGHT_RANGE")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-colors"
              style={{
                borderColor:
                  productType === "WEIGHT_RANGE"
                    ? "var(--color-emerald)"
                    : "var(--color-border)",
                backgroundColor:
                  productType === "WEIGHT_RANGE"
                    ? "var(--color-emerald-light)"
                    : "transparent",
              }}
            >
              <Gauge
                className="w-5 h-5"
                style={{ color: "var(--color-emerald)" }}
              />
              <span className="text-[12px] font-black text-gray-800">
                بازه‌وزنی (اسلایدر)
              </span>
              <span className="text-[10px] text-gray-400 text-center">
                مثل ۱ تا ۵ گرم، کاربر با اسلایدر انتخاب می‌کند
              </span>
            </button>
          </div>
        </div>

        {/* ── حالت Fixed: ردیف‌های تنوع ── */}
        {productType === "FIXED" && (
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[13px] font-black text-gray-700">
                تنوع‌ها (وزن/قیمت/موجودی)
              </h2>
              <button
                type="button"
                onClick={addVariantRow}
                className="flex items-center gap-1 text-[12px] font-bold"
                style={{ color: "var(--color-emerald)" }}
              >
                <Plus className="w-3.5 h-3.5" /> افزودن ردیف
              </button>
            </div>
            <div className="space-y-3">
              {variants.map((v, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end p-3 rounded-xl"
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
                      value={v.weightGrams}
                      onChange={(e) =>
                        updateVariant(i, { weightGrams: e.target.value })
                      }
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
                      value={v.priceAdjustment}
                      onChange={(e) =>
                        updateVariant(i, { priceAdjustment: e.target.value })
                      }
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
                      value={v.stockQuantity}
                      onChange={(e) =>
                        updateVariant(i, { stockQuantity: e.target.value })
                      }
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400">
                      SKU (اختیاری)
                    </label>
                    <input
                      dir="ltr"
                      value={v.sku}
                      onChange={(e) =>
                        updateVariant(i, { sku: e.target.value })
                      }
                      className="w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeVariantRow(i)}
                    className="h-9 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── حالت WEIGHT_RANGE: تنظیمات بازه + پیش‌نمایش زنده ── */}
        {productType === "WEIGHT_RANGE" && (
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 className="text-[13px] font-black text-gray-700">
              تنظیمات بازه وزن
            </h2>

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
                placeholder="0"
              />
            </div>

            {/* ── پیش‌نمایش زنده اسلایدر برای ادمین ── */}
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
                className="w-full accent-emerald"
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
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3.5 rounded-xl font-black text-white disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            "ایجاد محصول"
          )}
        </button>
      </form>
    </div>
  );
}
