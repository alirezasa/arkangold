// admin/app/components/shop/ProductEditor.tsx
"use client";
import { useEffect, useRef, useState } from "react";
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
  Plus,
  Trash2,
  Box,
  CheckCircle2,
  Circle,
  Save,
} from "lucide-react";
import { adminApi } from "@/app/core/api";
import RichTextEditor from "@/app/components/editor/RichTextEditor";
import ProductImagesManager from "./ProductImagesManager";
import PricingFormulaEditor from "./PricingFormulaEditor";
import ProductVariantsManager from "./ProductVariantsManager";
import ProductPackagingManager from "./ProductPackagingManager";

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
  isActive?: boolean;
}
export interface ProductSpecification {
  label: string;
  value: string;
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
  category?: { id: string; name: string; slug?: string };
  specifications?: ProductSpecification[];
  variants: VariantItem[];
}

const STATUS_OPTIONS: Array<{ value: ProductDetail["status"]; label: string }> =
  [
    { value: "ACTIVE", label: "فعال" },
    { value: "INACTIVE", label: "غیرفعال (پیش‌نویس)" },
    { value: "OUT_OF_STOCK", label: "ناموجود" },
  ];

const STATUS_BADGE: Record<
  ProductDetail["status"],
  { label: string; bg: string; color: string }
> = {
  ACTIVE: { label: "فعال", bg: "#dcfce7", color: "#16a34a" },
  INACTIVE: { label: "غیرفعال", bg: "#f3f4f6", color: "#6b7280" },
  OUT_OF_STOCK: { label: "ناموجود", bg: "#fef3c7", color: "#b45309" },
};

// نشانی اپ کاربر برای «مشاهده در اپ»
const APP_ORIGIN =
  process.env.NEXT_PUBLIC_APP_ORIGIN ||
  (process.env.NODE_ENV === "production"
    ? "https://app.arkan.gold"
    : "http://localhost:3000");
const GOLD_INGOT_CATEGORY_SLUG = "gold-ingot";

const CARD_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
} as const;

const fmtNumber = (v: string | number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n.toLocaleString("fa-IR") : null;
};

// بخش‌بندی فرم با عنوان و توضیح کوتاه
function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl p-4 sm:p-5 space-y-4" style={CARD_STYLE}>
      <div>
        <h2 className="text-[13px] font-black text-gray-800">{title}</h2>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] font-bold text-red-500">{message}</p>;
}

type TabKey = "basic" | "seo" | "pricing" | "packaging" | "gallery";

const TABS: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "basic", label: "اطلاعات پایه", icon: FileText },
  { key: "seo", label: "سئو", icon: Search },
  { key: "pricing", label: "فرمول قیمت", icon: Calculator },
  { key: "packaging", label: "بسته‌بندی", icon: Box },
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
  // تب‌های بازشده mount می‌مانند تا با جابه‌جایی بین تب‌ها، نوشته‌های ذخیره‌نشده از بین نرود
  const [visited, setVisited] = useState<TabKey[]>(["basic"]);
  const [basicDirty, setBasicDirty] = useState(false);

  const { data: categories } = useSWR<CategoryItem[]>(
    "/api/admin/shop/categories",
    fetcher,
  );
  // همان کلید گالری تصاویر؛ فقط برای شمارش در چک‌لیست تکمیل محصول
  const { data: images } = useSWR<unknown[]>(
    `/api/admin/shop/products/${id}/images`,
    fetcher,
  );

  const isDraft = data.slug.startsWith("draft-") || !data.name;

  const openTab = (key: TabKey) => {
    setTab(key);
    setVisited((v) => (v.includes(key) ? v : [...v, key]));
  };

  // هشدار مرورگر هنگام بستن/بارگذاری مجدد صفحه با تغییرات ذخیره‌نشده
  useEffect(() => {
    if (!basicDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [basicDirty]);

  const appPath =
    data.category?.slug === GOLD_INGOT_CATEGORY_SLUG
      ? `/dashboard/gold-ingot/${data.slug}`
      : `/dashboard/shop/${data.slug}`;
  const badge = STATUS_BADGE[data.status];

  // ── چک‌لیست تکمیل محصول ──
  const checklist: { label: string; done: boolean; tab: TabKey }[] = [
    {
      label: "نام و دسته‌بندی",
      done: !isDraft && !!data.category?.id,
      tab: "basic",
    },
    {
      label: "توضیحات",
      done: !!data.description?.trim(),
      tab: "basic",
    },
    {
      label: data.pricingMode === "WEIGHT_RANGE" ? "بازه وزن" : "تنوع / وزن",
      done:
        data.pricingMode === "WEIGHT_RANGE"
          ? !!data.weightRange
          : data.variants.length > 0,
      tab: "basic",
    },
    { label: "تصویر", done: (images?.length ?? 0) > 0, tab: "gallery" },
    {
      label: "سئو",
      done: !!data.seoTitle?.trim() && !!data.seoDesc?.trim(),
      tab: "seo",
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="max-w-6xl">
      <Link
        href="/shop/products"
        onClick={(e) => {
          if (
            basicDirty &&
            !window.confirm("تغییرات ذخیره‌نشده از بین می‌رود. خارج می‌شوید؟")
          ) {
            e.preventDefault();
          }
        }}
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 mb-4 hover:text-gray-600"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        بازگشت به محصولات
      </Link>

      {/* ── سربرگ: نام، وضعیت و میزان تکمیل ── */}
      <div className="rounded-2xl p-4 sm:p-5 mb-4" style={CARD_STYLE}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-black text-gray-900 break-words">
                {isDraft ? "محصول جدید" : data.name}
              </h1>
              <span
                className="badge"
                style={
                  isDraft
                    ? { background: "#fef3c7", color: "#b45309" }
                    : { background: badge.bg, color: badge.color }
                }
              >
                {isDraft ? "پیش‌نویس" : badge.label}
              </span>
            </div>
            {isDraft ? (
              <p className="text-[11px] text-gray-400 mt-1">
                نام، دسته‌بندی و قیمت را وارد و «ایجاد محصول» را بزنید؛ سپس
                تنوع‌ها، تصاویر و فرمول قیمت را کامل کنید.
              </p>
            ) : (
              <span className="text-[11px] text-gray-400" dir="ltr">
                /{data.slug}
              </span>
            )}
          </div>
          {!isDraft && (
            <a
              href={`${APP_ORIGIN}${appPath}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-[12px] font-bold text-gray-500 hover:bg-gray-50"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              مشاهده در اپ کاربر
            </a>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-bold text-gray-500">
              تکمیل محصول
            </span>
            <span className="text-[11px] font-bold text-gray-400">
              {doneCount.toLocaleString("fa-IR")} از{" "}
              {checklist.length.toLocaleString("fa-IR")}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-3">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(doneCount / checklist.length) * 100}%`,
                backgroundColor: "var(--color-gold-500)",
              }}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {checklist.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => openTab(c.tab)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                  c.done
                    ? "bg-green-50 text-green-700"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {c.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <Circle className="w-3.5 h-3.5" />
                )}
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── تب‌ها ── */}
      <div
        className="flex gap-1 mb-5 overflow-x-auto rounded-2xl p-1.5"
        style={CARD_STYLE}
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          // گالری در دسکتاپ همیشه کنار صفحه است
          const desktopHidden = t.key === "gallery" ? "lg:hidden" : "";
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => openTab(t.key)}
              aria-pressed={active}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-colors shrink-0 ${desktopHidden}`}
              style={
                active
                  ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                  : { color: "#6b7280" }
              }
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.key === "basic" && basicDirty && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  title="تغییرات ذخیره‌نشده"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── لایه دو ستونه در دسکتاپ: محتوای اصلی + گالری کناری ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 lg:items-start">
        <div className="min-w-0">
          <div className={tab === "basic" ? "" : "hidden"}>
            <BasicInfoTab
              id={id}
              data={data}
              categories={categories}
              mutate={mutate}
              onCreated={() => router.replace(`/shop/products/${id}`)}
              onDirtyChange={setBasicDirty}
            />
            {!isDraft && data.pricingMode === "FIXED" && (
              <div className="mt-6">
                <ProductVariantsManager productId={id} />
              </div>
            )}
          </div>
          {visited.includes("seo") && (
            <div className={tab === "seo" ? "" : "hidden"}>
              <SeoTab id={id} data={data} mutate={mutate} />
            </div>
          )}
          {visited.includes("pricing") && (
            <div className={tab === "pricing" ? "" : "hidden"}>
              <PricingFormulaEditor productId={id} />
            </div>
          )}
          {visited.includes("packaging") && (
            <div className={tab === "packaging" ? "" : "hidden"}>
              <ProductPackagingManager productId={id} />
            </div>
          )}
          {tab === "gallery" && (
            <div className="lg:hidden">
              <ProductImagesManager productId={id} />
            </div>
          )}
        </div>

        {/* ── گالری همیشه در سایدبار دسکتاپ قابل مشاهده (مثل ووکامرس) ── */}
        <div className="hidden lg:block lg:sticky lg:top-4">
          <ProductImagesManager productId={id} />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// مشخصات فنی (ابعاد، وزن، کد GTIN، ...) — در صفحه محصول به‌صورت جدول
// و «ابعاد» و «وزن» در کارت‌های صفحه خرید شمش نمایش داده می‌شوند
// ══════════════════════════════════════════
const SPEC_PRESETS = [
  "ابعاد",
  "وزن",
  "کد محصول",
  "کد GTIN",
  "کشور سازنده",
  "شرکت سازنده",
  "برند",
];

function SpecificationsEditor({
  specs,
  onChange,
}: {
  specs: ProductSpecification[];
  onChange: (specs: ProductSpecification[]) => void;
}) {
  const update = (i: number, patch: Partial<ProductSpecification>) =>
    onChange(specs.map((sp, idx) => (idx === i ? { ...sp, ...patch } : sp)));
  const add = (label = "") => onChange([...specs, { label, value: "" }]);
  const remove = (i: number) => onChange(specs.filter((_, idx) => idx !== i));
  const usedLabels = new Set(specs.map((sp) => sp.label.trim()));

  return (
    <div className="space-y-2">
      <h2 className="text-[13px] font-black text-gray-800">
        مشخصات فنی محصول
      </h2>
      <p className="text-[10px] text-gray-400">
        «ابعاد» و «وزن» در کارت محصولات صفحه خرید شمش هم نمایش داده می‌شوند.
      </p>

      {specs.map((sp, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            value={sp.label}
            onChange={(e) => update(i, { label: e.target.value })}
            placeholder="عنوان (مثلاً ابعاد)"
            maxLength={60}
            className="w-2/5 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
          />
          <input
            value={sp.value}
            onChange={(e) => update(i, { value: e.target.value })}
            placeholder="مقدار (مثلاً ۲۰×۳۰ میلی‌متر)"
            maxLength={300}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="p-2 rounded-lg text-red-500 hover:bg-red-50"
            title="حذف"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {SPEC_PRESETS.filter((label) => !usedLabels.has(label)).map(
          (label) => (
            <button
              key={label}
              type="button"
              onClick={() => add(label)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-[11px] font-bold text-gray-500 hover:bg-gray-50"
            >
              <Plus className="w-3 h-3" />
              {label}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => add()}
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-[11px] font-bold text-gray-500 hover:bg-gray-50"
        >
          <Plus className="w-3 h-3" />
          ردیف دلخواه
        </button>
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
  onDirtyChange,
}: {
  id: string;
  data: ProductDetail;
  categories?: CategoryItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutate: () => Promise<any>;
  onCreated: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const isDraft = data.slug.startsWith("draft-") || !data.name;
  const isGoldProduct = Boolean(data.purityKarat);
  const [name, setName] = useState(data.name);
  const [categoryId, setCategoryId] = useState(data.category?.id ?? "");
  const [shortDescription, setShortDescription] = useState(
    data.shortDescription ?? "",
  );
  const [description, setDescription] = useState(data.description ?? "");
  const [specs, setSpecs] = useState<ProductSpecification[]>(
    data.specifications ?? [],
  );
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // ── تشخیص تغییرات ذخیره‌نشده: مقایسه‌ی وضعیت فعلی فرم با آخرین ذخیره ──
  const snapshot = JSON.stringify([
    name,
    categoryId,
    shortDescription,
    description,
    specs,
    basePriceToman,
    status,
    pricingMode,
    minWeight,
    maxWeight,
    weightStep,
    pricePerGramToman,
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const clearFieldError = (key: string) =>
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const save = async () => {
    setError(null);

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "نام محصول را وارد کنید";
    if (!categoryId) errors.categoryId = "دسته‌بندی را انتخاب کنید";
    const basePriceRial = Number(basePriceToman) * 10;
    // محصول طلایی از فرمول قیمت می‌گیرد و این فیلد برایش قفل است
    if (!isGoldProduct && (!basePriceToman || !(basePriceRial > 0))) {
      errors.basePriceToman = "قیمت پایه معتبر وارد کنید";
    }

    const payload: Record<string, unknown> = {
      name: name.trim(),
      categoryId,
      // رشته خالی (نه undefined) تا پاک کردن توضیحات هم ذخیره شود
      description: description.trim(),
      shortDescription: shortDescription.trim(),
      specifications: specs
        .map((sp) => ({ label: sp.label.trim(), value: sp.value.trim() }))
        .filter((sp) => sp.label && sp.value),
      status,
      pricingMode,
    };
    if (basePriceRial > 0) payload.basePriceRial = basePriceRial;

    if (pricingMode === "WEIGHT_RANGE") {
      const min = Number(minWeight),
        max = Number(maxWeight),
        step = Number(weightStep),
        pricePerGramRial = Number(pricePerGramToman) * 10;
      if (!min || !max || min >= max) {
        errors.weightRange = "بازه وزن معتبر نیست (حداقل باید کمتر از حداکثر باشد)";
      } else if (!step || step <= 0) {
        errors.weightRange = "گام وزن باید بزرگتر از صفر باشد";
      }
      if (!pricePerGramToman || !(pricePerGramRial > 0)) {
        errors.pricePerGramToman = "قیمت هر گرم را وارد کنید";
      }
      Object.assign(payload, {
        minWeightGrams: min,
        maxWeightGrams: max,
        weightStepGrams: step,
        pricePerGramRial,
      });
    }

    setFieldErrors(errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      setError("لطفاً موارد مشخص‌شده را اصلاح کنید");
      document
        .querySelector(`[data-field="${firstInvalid}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSaving(true);
    try {
      // اولین ذخیره هم PATCH است چون رکورد پیش‌نویس از قبل ساخته شده
      await adminApi.patch(`/api/admin/shop/products/${id}`, payload);
      setSavedSnapshot(snapshot);
      await mutate();
      if (isDraft) onCreated();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره تغییرات"));
    } finally {
      setSaving(false);
    }
  };

  // ذخیره با Ctrl+S / Cmd+S (فقط وقتی همین تب روی صفحه است)
  const formRef = useRef<HTMLFormElement>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (!formRef.current || formRef.current.offsetParent === null) return;
        e.preventDefault();
        saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const inputCls = (key?: string) =>
    `w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-gold-500 ${
      key && fieldErrors[key] ? "border-red-400" : "border-gray-200"
    }`;
  const smallInputCls =
    "w-full px-2.5 py-2 rounded-lg border border-gray-200 text-[12px] text-left outline-none focus:border-gold-500";

  const pricingOption = (
    mode: "FIXED" | "WEIGHT_RANGE",
    title: string,
    hint: string,
  ) => {
    const active = pricingMode === mode;
    return (
      <button
        type="button"
        onClick={() => setPricingMode(mode)}
        aria-pressed={active}
        className="p-3 rounded-xl border-2 text-right transition-colors"
        style={{
          borderColor: active ? "var(--color-emerald)" : "var(--color-border)",
          backgroundColor: active ? "var(--color-emerald-light)" : "transparent",
        }}
      >
        <span className="block text-[12px] font-black text-gray-800">
          {title}
        </span>
        <span className="block text-[10px] text-gray-500 mt-0.5 leading-relaxed">
          {hint}
        </span>
      </button>
    );
  };

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
      noValidate
    >
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── اطلاعات اصلی ── */}
      <FormSection title="اطلاعات اصلی">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5 sm:col-span-2" data-field="name">
            <label className="text-[12px] font-bold text-gray-500">
              نام محصول <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                clearFieldError("name");
              }}
              autoFocus={isDraft}
              className={inputCls("name")}
              placeholder="مثلاً شمش طلای ۵ گرمی"
            />
            <FieldError message={fieldErrors.name} />
          </div>

          <div className="space-y-1.5" data-field="categoryId">
            <label className="text-[12px] font-bold text-gray-500">
              دسته‌بندی <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                clearFieldError("categoryId");
              }}
              className={inputCls("categoryId")}
            >
              <option value="">انتخاب کنید...</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.isActive === false ? " (غیرفعال)" : ""}
                </option>
              ))}
            </select>
            <FieldError message={fieldErrors.categoryId} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">
              وضعیت نمایش
            </label>
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as ProductDetail["status"])
              }
              className={inputCls()}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </FormSection>

      {/* ── توضیحات ── */}
      <FormSection
        title="توضیحات"
        hint="توضیح کوتاه بالای صفحه محصول و در کارت‌ها دیده می‌شود؛ توضیحات کامل پایین صفحه."
      >
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[12px] font-bold text-gray-500">
              توضیح کوتاه
            </label>
            <span className="text-[10px] text-gray-400" dir="ltr">
              {shortDescription.length}/200
            </span>
          </div>
          <textarea
            value={shortDescription}
            onChange={(e) => setShortDescription(e.target.value)}
            rows={2}
            maxLength={200}
            className={`${inputCls()} resize-y`}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            توضیحات کامل محصول
          </label>
          <RichTextEditor value={description} onChange={setDescription} />
          <p className="text-[10px] text-gray-400 leading-relaxed">
            با نوار ابزار می‌توانید تیتر، لیست، جدول، لینک و نکته اضافه کنید؛
            متن با همین قالب‌بندی در صفحه محصول اپ (موبایل و دسکتاپ) نمایش داده
            می‌شود.
          </p>
        </div>
      </FormSection>

      {/* ── مشخصات فنی ── */}
      <section className="rounded-2xl p-4 sm:p-5" style={CARD_STYLE}>
        <SpecificationsEditor specs={specs} onChange={setSpecs} />
      </section>

      {/* ── قیمت‌گذاری ── */}
      <FormSection title="قیمت‌گذاری">
        <div className="space-y-1.5" data-field="basePriceToman">
          <label className="text-[12px] font-bold text-gray-500">
            قیمت پایه (تومان){" "}
            {!isGoldProduct && <span className="text-red-500">*</span>}
          </label>
          <input
            type="number"
            dir="ltr"
            inputMode="numeric"
            disabled={isGoldProduct}
            value={basePriceToman}
            onChange={(e) => {
              setBasePriceToman(e.target.value);
              clearFieldError("basePriceToman");
            }}
            className={`${inputCls("basePriceToman")} text-left disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed`}
          />
          <FieldError message={fieldErrors.basePriceToman} />
          {isGoldProduct ? (
            <p className="text-[10px] text-amber-600">
              این محصول عیار طلا دارد؛ قیمتش از نرخ لحظه‌ای طلا و فرمول
              قیمت‌گذاری (تب «فرمول قیمت») محاسبه می‌شود و این فیلد نادیده گرفته
              می‌شود.
            </p>
          ) : (
            <p className="text-[10px] text-gray-400">
              {fmtNumber(basePriceToman)
                ? `${fmtNumber(basePriceToman)} تومان — `
                : ""}
              برای محصولات غیرطلایی، مبنای فرمول قیمت‌گذاری است.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="text-[12px] font-bold text-gray-500">
            نوع قیمت‌گذاری
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pricingOption(
              "FIXED",
              "تنوع‌های ثابت",
              "چند وزن مشخص با موجودی جدا (مثل شمش ۱، ۵ و ۱۰ گرمی)",
            )}
            {pricingOption(
              "WEIGHT_RANGE",
              "بازه‌وزنی",
              "کاربر وزن دلخواه را در یک بازه وارد می‌کند",
            )}
          </div>
          {pricingMode === "FIXED" && (
            <p className="text-[10px] text-gray-400">
              {isDraft
                ? "پس از ایجاد محصول، تنوع‌ها (وزن و موجودی) را پایین همین صفحه اضافه کنید."
                : "تنوع‌ها (وزن و موجودی) پایین همین صفحه مدیریت می‌شوند."}
            </p>
          )}
        </div>

        {pricingMode === "WEIGHT_RANGE" && (
          <div className="space-y-1.5" data-field="weightRange">
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
                  onChange={(e) => {
                    setMinWeight(e.target.value);
                    clearFieldError("weightRange");
                  }}
                  className={smallInputCls}
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
                  onChange={(e) => {
                    setMaxWeight(e.target.value);
                    clearFieldError("weightRange");
                  }}
                  className={smallInputCls}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-gray-400">
                  گام (گرم)
                </label>
                <input
                  type="number"
                  step="0.1"
                  dir="ltr"
                  value={weightStep}
                  onChange={(e) => {
                    setWeightStep(e.target.value);
                    clearFieldError("weightRange");
                  }}
                  className={smallInputCls}
                />
              </div>
              <div className="space-y-1" data-field="pricePerGramToman">
                <label className="text-[10px] font-bold text-gray-400">
                  قیمت هر گرم (تومان)
                </label>
                <input
                  type="number"
                  dir="ltr"
                  value={pricePerGramToman}
                  onChange={(e) => {
                    setPricePerGramToman(e.target.value);
                    clearFieldError("pricePerGramToman");
                  }}
                  className={smallInputCls}
                />
              </div>
            </div>
            <FieldError message={fieldErrors.weightRange} />
            <FieldError message={fieldErrors.pricePerGramToman} />
          </div>
        )}
      </FormSection>

      {/* ── نوار ذخیره‌ی چسبان (بالای منوی پایین موبایل) ── */}
      <div
        className="sticky bottom-24 lg:bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl px-4 py-3 shadow-lg"
        style={CARD_STYLE}
      >
        <p className="min-w-0 text-[12px] font-bold">
          {saved ? (
            <span className="flex items-center gap-1.5 text-green-600">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              ذخیره شد
            </span>
          ) : dirty ? (
            <span className="flex items-center gap-1.5 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              تغییرات ذخیره‌نشده
            </span>
          ) : (
            <span className="text-gray-400">
              {isDraft ? "هنوز ایجاد نشده" : "همه‌ی تغییرات ذخیره شده"}
            </span>
          )}
        </p>
        <button
          type="submit"
          disabled={saving || (!dirty && !isDraft)}
          title="Ctrl+S"
          className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-black text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {isDraft ? "ایجاد محصول" : "ذخیره تغییرات"}
        </button>
      </div>
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
