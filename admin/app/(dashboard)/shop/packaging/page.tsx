// admin/app/(dashboard)/shop/packaging/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Box,
  Loader2,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Pencil,
  Trash2,
  Power,
  Gift,
  ImagePlus,
  Link2,
  Save,
  Package,
} from "lucide-react";

const NEST_ORIGIN =
  process.env.NEXT_PUBLIC_NEST_ORIGIN || "http://localhost:5000";

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

export interface PackagingOptionItem {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  imageUrl: string | null;
  priceToman: string;
  perUnit: boolean;
  freeEligible: boolean;
  freeThresholdToman: string | null;
  isActive: boolean;
  sortOrder: number;
  productsCount?: number;
  ordersCount?: number;
}

interface ListResponse {
  settings: { freeThresholdToman: string };
  productsCount: number;
  data: PackagingOptionItem[];
}

const faNum = (n: number | string) =>
  Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 0 });

const cardStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
};

const inputCls =
  "mt-1.5 w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-[13px] font-bold outline-none focus:border-gold-500 disabled:bg-gray-50";

const digitsOnly = (v: string) =>
  v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");

/** شرح قانون رایگان شدن یک طرح برای نمایش */
function freeRuleLabel(item: PackagingOptionItem, globalToman: number) {
  if (Number(item.priceToman) <= 0) return "همیشه رایگان";
  if (!item.freeEligible) return "هرگز رایگان نمی‌شود";
  if (item.freeThresholdToman)
    return `رایگان برای خرید بالای ${faNum(item.freeThresholdToman)} تومان (اختصاصی)`;
  if (globalToman > 0)
    return `رایگان برای خرید بالای ${faNum(globalToman)} تومان (عمومی)`;
  return "آستانه عمومی تعیین نشده";
}

export default function PackagingPage() {
  const { data, isLoading, mutate } = useSWR<ListResponse>(
    "/api/admin/shop/packaging",
    fetcher,
  );
  const [editing, setEditing] = useState<PackagingOptionItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const globalToman = Number(data?.settings.freeThresholdToman ?? 0);

  const run = async (
    id: string,
    action: () => Promise<unknown>,
    fallback: string,
  ) => {
    setBusyId(id);
    setActionError(null);
    setNotice(null);
    try {
      await action();
      await mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, fallback));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = (item: PackagingOptionItem) =>
    run(
      item.id,
      () =>
        axios.patch(`/api/admin/shop/packaging/${item.id}`, {
          isActive: !item.isActive,
        }),
      "خطا در تغییر وضعیت",
    );

  const remove = (item: PackagingOptionItem) => {
    if (!confirm(`طرح «${item.name}» حذف شود؟`)) return;
    run(
      item.id,
      () => axios.delete(`/api/admin/shop/packaging/${item.id}`),
      "خطا در حذف طرح",
    );
  };

  const assignAll = (item: PackagingOptionItem) => {
    if (
      !confirm(
        `طرح «${item.name}» به همه محصولات اضافه شود؟ (گزینه پیش‌فرض محصولات تغییر نمی‌کند)`,
      )
    )
      return;
    run(
      item.id,
      async () => {
        const res = await axios.post(
          `/api/admin/shop/packaging/${item.id}/assign-all`,
        );
        setNotice(res.data?.message ?? "انجام شد");
      },
      "خطا در اختصاص طرح",
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-black text-gray-900 mb-1">
            بسته‌بندی ارسال کالا
          </h1>
          <p className="text-[12px] text-gray-400">
            طرح‌ها و قیمت بسته‌بندی را تعریف کنید، از صفحه ویرایش هر محصول
            (تب «بسته‌بندی») طرح‌های مجاز آن را اختصاص دهید تا کاربر هنگام خرید
            انتخاب کند
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" />
          طرح جدید
        </button>
      </div>

      {data && (
        <FreeThresholdCard
          currentToman={data.settings.freeThresholdToman}
          onSaved={() => mutate()}
        />
      )}

      {actionError && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {actionError}
        </div>
      )}
      {notice && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-[13px] font-bold">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          {notice}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.data.length ? (
        <div
          className="flex flex-col items-center gap-3 py-14 rounded-2xl"
          style={cardStyle}
        >
          <Box className="w-10 h-10 text-gray-300" />
          <p className="text-[13px] font-bold text-gray-400">
            هنوز طرح بسته‌بندی‌ای تعریف نشده است
          </p>
          <p className="text-[11px] text-gray-400 max-w-md text-center leading-relaxed">
            پیشنهاد: یک طرح «بسته‌بندی استاندارد» با قیمت صفر به‌عنوان گزینه
            پیش‌فرض و چند طرح ویژه (جعبه چوبی، جعبه مخمل هدیه، ...) تعریف کنید.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.data.map((item) => (
            <div
              key={item.id}
              className={`rounded-2xl overflow-hidden flex flex-col ${
                item.isActive ? "" : "opacity-60"
              }`}
              style={cardStyle}
            >
              <div className="aspect-[16/9] bg-gray-50 flex items-center justify-center overflow-hidden">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${NEST_ORIGIN}${item.imageUrl}`}
                    alt={item.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Package className="w-12 h-12 text-gray-300" strokeWidth={1} />
                )}
              </div>
              <div className="p-4 flex-1 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-black text-gray-800 truncate">
                      {item.name}
                    </p>
                    {item.code && (
                      <p className="text-[11px] text-gray-400 font-mono" dir="ltr">
                        {item.code}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      item.isActive
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {item.isActive ? "فعال" : "غیرفعال"}
                  </span>
                </div>

                <p className="text-[16px] font-black text-gray-900">
                  {Number(item.priceToman) > 0 ? (
                    <>
                      {faNum(item.priceToman)}
                      <span className="text-[11px] font-bold text-gray-400 mr-1">
                        تومان {item.perUnit ? "/ هر عدد کالا" : "/ هر ردیف سفارش"}
                      </span>
                    </>
                  ) : (
                    <span className="text-emerald-600">رایگان</span>
                  )}
                </p>

                <p className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500">
                  <Gift className="w-3.5 h-3.5 text-gold-500" />
                  {freeRuleLabel(item, globalToman)}
                </p>

                {item.description && (
                  <p className="text-[11px] text-gray-400 line-clamp-2">
                    {item.description}
                  </p>
                )}

                <p className="text-[11px] text-gray-400 mt-auto">
                  {faNum(item.productsCount ?? 0)} از {faNum(data.productsCount)}{" "}
                  محصول — {faNum(item.ordersCount ?? 0)} ردیف سفارش
                </p>

                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-gray-100">
                  <ActionBtn
                    icon={Pencil}
                    label="ویرایش"
                    onClick={() => setEditing(item)}
                    disabled={busyId === item.id}
                  />
                  <ActionBtn
                    icon={Power}
                    label={item.isActive ? "غیرفعال" : "فعال"}
                    onClick={() => toggleActive(item)}
                    disabled={busyId === item.id}
                  />
                  <ActionBtn
                    icon={Link2}
                    label="همه محصولات"
                    onClick={() => assignAll(item)}
                    disabled={busyId === item.id}
                  />
                  {!item.ordersCount && (
                    <ActionBtn
                      icon={Trash2}
                      label="حذف"
                      danger
                      onClick={() => remove(item)}
                      disabled={busyId === item.id}
                    />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <PackagingFormModal
          item={editing}
          globalToman={globalToman}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setCreating(false);
            setEditing(null);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  danger,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border disabled:opacity-50 ${
        danger
          ? "border-red-100 text-red-600 hover:bg-red-50"
          : "border-gray-200 text-gray-600 hover:bg-gray-50"
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

// ══════════════════════════════════════════
// آستانه عمومی رایگان شدن بسته‌بندی
// ══════════════════════════════════════════
function FreeThresholdCard({
  currentToman,
  onSaved,
}: {
  currentToman: string;
  onSaved: () => void;
}) {
  const initial = Number(currentToman) > 0 ? String(Number(currentToman)) : "";
  const [value, setValue] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await axios.put("/api/admin/shop/packaging/settings", {
        freeThresholdRial: Number(value || 0) * 10,
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره تنظیمات"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl p-4 mb-5 space-y-3" style={cardStyle}>
      <div className="flex items-center gap-2">
        <Gift className="w-4 h-4 text-gold-500" />
        <h2 className="text-[13px] font-black text-gray-800">
          بسته‌بندی رایگان برای خریدهای بزرگ
        </h2>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        اگر جمع اقلام سبد خرید (پیش از کد تخفیف) به این مبلغ برسد، هزینه
        بسته‌بندی طرح‌های مشمول صفر می‌شود و در فاکتور به‌صورت «رایگان — هدیه
        خرید» درج می‌شود. برای هر طرح می‌توانید آستانه اختصاصی تعیین کنید یا آن
        را از این طرح مستثنی کنید. خالی یا صفر = غیرفعال.
      </p>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <label className="flex-1 max-w-sm text-[12px] font-bold text-gray-600">
          آستانه عمومی (تومان)
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            value={value ? Number(value).toLocaleString("en-US") : ""}
            onChange={(e) => {
              setValue(digitsOnly(e.target.value));
              setSaved(false);
            }}
            placeholder="مثلاً 50,000,000"
            className={inputCls}
          />
        </label>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          ذخیره
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-red-600">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          {Number(value) > 0
            ? `ذخیره شد — بسته‌بندی برای خرید بالای ${faNum(value)} تومان رایگان است`
            : "ذخیره شد — بسته‌بندی رایگان عمومی غیرفعال است"}
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// فرم ایجاد / ویرایش طرح
// ══════════════════════════════════════════
type FreeMode = "GLOBAL" | "CUSTOM" | "NEVER";

function PackagingFormModal({
  item,
  globalToman,
  onClose,
  onSaved,
}: {
  item: PackagingOptionItem | null;
  globalToman: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [code, setCode] = useState(item?.code ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(
    item ? String(Number(item.priceToman)) : "",
  );
  const [perUnit, setPerUnit] = useState(item?.perUnit ?? true);
  const [freeMode, setFreeMode] = useState<FreeMode>(
    !item
      ? "GLOBAL"
      : !item.freeEligible
        ? "NEVER"
        : item.freeThresholdToman
          ? "CUSTOM"
          : "GLOBAL",
  );
  const [customThreshold, setCustomThreshold] = useState(
    item?.freeThresholdToman ? String(Number(item.freeThresholdToman)) : "",
  );
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? ""));
  const [isActive, setIsActive] = useState(item?.isActive ?? true);
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError("نام طرح را وارد کنید");
    if (freeMode === "CUSTOM" && !(Number(customThreshold) > 0)) {
      return setError("آستانه اختصاصی رایگان شدن را وارد کنید");
    }

    const payload = {
      name: name.trim(),
      code: code.trim() || null,
      description: description.trim() || null,
      priceRial: Number(price || 0) * 10,
      perUnit,
      freeEligible: freeMode !== "NEVER",
      freeThresholdRial:
        freeMode === "CUSTOM" ? Number(customThreshold) * 10 : null,
      isActive,
      ...(sortOrder !== "" ? { sortOrder: Number(sortOrder) } : {}),
    };

    setSaving(true);
    try {
      const res = item
        ? await axios.patch(`/api/admin/shop/packaging/${item.id}`, payload)
        : await axios.post("/api/admin/shop/packaging", payload);
      const id: string = res.data.id;

      if (file) {
        const form = new FormData();
        form.append("file", file);
        await axios.post(`/api/admin/shop/packaging/${id}/image`, form);
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره طرح"));
    } finally {
      setSaving(false);
    }
  };

  const removeImage = async () => {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      await axios.delete(`/api/admin/shop/packaging/${item.id}/image`);
      setImageUrl(null);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در حذف تصویر"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-gray-900 flex items-center gap-2">
            <Box className="w-4 h-4 text-gold-500" />
            {item ? `ویرایش طرح «${item.name}»` : "طرح بسته‌بندی جدید"}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* تصویر طرح */}
        <div className="flex items-center gap-3">
          <div className="w-24 h-24 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center shrink-0">
            {preview || imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview ?? `${NEST_ORIGIN}${imageUrl}`}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <Package className="w-8 h-8 text-gray-300" strokeWidth={1} />
            )}
          </div>
          <div className="space-y-1.5">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-[12px] font-bold text-gray-600 cursor-pointer hover:bg-gray-50">
              <ImagePlus className="w-4 h-4" />
              {preview || imageUrl ? "تغییر تصویر" : "انتخاب تصویر"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {item && imageUrl && !file && (
              <button
                type="button"
                onClick={removeImage}
                disabled={saving}
                className="block text-[11px] font-bold text-red-500 hover:underline"
              >
                حذف تصویر
              </button>
            )}
            <p className="text-[10px] text-gray-400">
              JPEG / PNG / WEBP — حداکثر ۳ مگابایت
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[12px] font-bold text-gray-600">
            نام طرح *
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="مثلاً جعبه چوبی لوکس"
              className={inputCls}
            />
          </label>
          <label className="text-[12px] font-bold text-gray-600">
            کد انبار (اختیاری)
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={30}
              dir="ltr"
              placeholder="BOX-WOOD"
              className={`${inputCls} font-mono`}
            />
          </label>
        </div>

        <label className="block text-[12px] font-bold text-gray-600">
          توضیحات (نمایش به کاربر)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            className={`${inputCls} font-medium resize-none`}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[12px] font-bold text-gray-600">
            قیمت (تومان) — صفر = رایگان
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={price ? Number(price).toLocaleString("en-US") : ""}
              onChange={(e) => setPrice(digitsOnly(e.target.value))}
              placeholder="0"
              className={inputCls}
            />
          </label>
          <div className="text-[12px] font-bold text-gray-600">
            نحوه محاسبه قیمت
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              {(
                [
                  [true, "هر عدد کالا"],
                  [false, "هر ردیف سفارش"],
                ] as [boolean, string][]
              ).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPerUnit(v)}
                  className={`py-2.5 rounded-xl text-[11px] font-bold border-2 ${
                    perUnit === v
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl p-3 space-y-2 bg-gray-50">
          <p className="text-[12px] font-black text-gray-700 flex items-center gap-1.5">
            <Gift className="w-3.5 h-3.5 text-gold-500" />
            رایگان شدن در خریدهای بزرگ
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
            {(
              [
                [
                  "GLOBAL",
                  globalToman > 0
                    ? `آستانه عمومی (${faNum(globalToman)} ت)`
                    : "آستانه عمومی (تعیین نشده)",
                ],
                ["CUSTOM", "آستانه اختصاصی"],
                ["NEVER", "هرگز رایگان نشود"],
              ] as [FreeMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFreeMode(mode)}
                className={`py-2 px-2 rounded-xl text-[11px] font-bold border-2 bg-white ${
                  freeMode === mode
                    ? "border-emerald-500 text-emerald-700"
                    : "border-gray-200 text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {freeMode === "CUSTOM" && (
            <label className="block text-[12px] font-bold text-gray-600">
              رایگان برای خرید بالای (تومان)
              <input
                type="text"
                inputMode="numeric"
                dir="ltr"
                value={
                  customThreshold
                    ? Number(customThreshold).toLocaleString("en-US")
                    : ""
                }
                onChange={(e) => setCustomThreshold(digitsOnly(e.target.value))}
                className={inputCls}
              />
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 items-end">
          <label className="text-[12px] font-bold text-gray-600">
            ترتیب نمایش
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={sortOrder}
              onChange={(e) => setSortOrder(digitsOnly(e.target.value))}
              placeholder="خودکار"
              className={inputCls}
            />
          </label>
          <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 pb-3">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            فعال (قابل انتخاب توسط کاربر)
          </label>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold border-2 border-gray-200 text-gray-600"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="flex-2 py-3 rounded-xl text-[13px] font-black text-white flex items-center justify-center gap-2 disabled:opacity-50"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "ذخیره طرح"}
          </button>
        </div>
      </div>
    </div>
  );
}
