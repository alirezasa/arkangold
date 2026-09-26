// admin/app/components/shop/ProductPackagingManager.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Package,
  Save,
  Star,
  Settings2,
} from "lucide-react";
import { adminApi } from "@/app/core/api";

const NEST_ORIGIN =
  process.env.NEXT_PUBLIC_NEST_ORIGIN || "http://localhost:5000";

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

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

interface ProductPackagingOption {
  id: string;
  name: string;
  code: string | null;
  imageUrl: string | null;
  priceToman: string;
  perUnit: boolean;
  isActive: boolean;
  assigned: boolean;
  isDefault: boolean;
  linkSortOrder: number | null;
}

interface ProductPackagingResponse {
  productId: string;
  options: ProductPackagingOption[];
}

/**
 * انتخاب طرح‌های بسته‌بندی قابل انتخاب کاربر برای یک محصول + گزینه پیش‌فرض.
 * اگر هیچ طرحی انتخاب نشود، انتخاب بسته‌بندی در صفحه محصول نمایش داده نمی‌شود.
 */
export default function ProductPackagingManager({
  productId,
}: {
  productId: string;
}) {
  const { data, isLoading, mutate } = useSWR<ProductPackagingResponse>(
    `/api/admin/shop/products/${productId}/packaging`,
    fetcher,
  );

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
      </div>
    );
  }

  // فرم با key بازسازی می‌شود تا بعد از ذخیره، وضعیت از سرور خوانده شود
  return (
    <PackagingForm
      key={data.options
        .map((o) => `${o.id}:${o.assigned}:${o.isDefault}`)
        .join("|")}
      productId={productId}
      options={data.options}
      onSaved={() => mutate()}
    />
  );
}

function PackagingForm({
  productId,
  options,
  onSaved,
}: {
  productId: string;
  options: ProductPackagingOption[];
  onSaved: () => void;
}) {
  // ترتیب ذخیره‌شده محصول حفظ می‌شود؛ طرح‌های تازه انتخاب‌شده به انتها می‌روند
  const [selected, setSelected] = useState<string[]>(() =>
    options
      .filter((o) => o.assigned)
      .sort((a, b) => (a.linkSortOrder ?? 0) - (b.linkSortOrder ?? 0))
      .map((o) => o.id),
  );
  const [defaultId, setDefaultId] = useState<string | null>(
    options.find((o) => o.isDefault)?.id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const effectiveDefault =
    defaultId && selected.includes(defaultId) ? defaultId : selected[0] ?? null;

  const toggle = (id: string) => {
    setSaved(false);
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await adminApi.put(`/api/admin/shop/products/${productId}/packaging`, {
        options: selected.map((id) => ({
          packagingOptionId: id,
          isDefault: id === effectiveDefault,
        })),
      });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره بسته‌بندی محصول"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[13px] font-black text-gray-700">
            بسته‌بندی ارسال
          </h2>
          <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-lg">
            طرح‌هایی که کاربر هنگام خرید این محصول می‌تواند انتخاب کند. گزینه
            پیش‌فرض در صفحه محصول از قبل انتخاب شده است. اگر هیچ طرحی انتخاب
            نشود، انتخاب بسته‌بندی نمایش داده نمی‌شود.
          </p>
        </div>
        <Link
          href="/shop/packaging"
          className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 hover:text-gray-700"
        >
          <Settings2 className="w-3.5 h-3.5" />
          مدیریت طرح‌ها و قیمت‌ها
        </Link>
      </div>

      {options.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <Package className="w-10 h-10 text-gray-300" />
          <p className="text-[12px] font-bold text-gray-400">
            هنوز طرح بسته‌بندی‌ای تعریف نشده است
          </p>
          <Link
            href="/shop/packaging"
            className="text-[12px] font-bold hover:underline"
            style={{ color: "var(--color-emerald)" }}
          >
            تعریف طرح بسته‌بندی
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {options.map((o) => {
            const checked = selected.includes(o.id);
            const isDefault = effectiveDefault === o.id;
            return (
              <div
                key={o.id}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                  checked
                    ? "border-emerald-500 bg-emerald-50/40"
                    : "border-gray-100"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.id)}
                  className="w-4 h-4 accent-emerald-600 shrink-0"
                  aria-label={`انتخاب ${o.name}`}
                />
                <div className="w-12 h-12 rounded-lg bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                  {o.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${NEST_ORIGIN}${o.imageUrl}`}
                      alt={o.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggle(o.id)}
                  className="flex-1 min-w-0 text-right"
                >
                  <p className="text-[13px] font-bold text-gray-800 truncate">
                    {o.name}
                    {!o.isActive && (
                      <span className="mr-2 px-1.5 py-0.5 rounded-md bg-gray-100 text-[10px] text-gray-500">
                        غیرفعال
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-gray-400">
                    {Number(o.priceToman) > 0
                      ? `${Number(o.priceToman).toLocaleString("fa-IR")} تومان ${
                          o.perUnit ? "/ هر عدد" : "/ هر ردیف"
                        }`
                      : "رایگان"}
                  </p>
                </button>
                {checked && (
                  <button
                    type="button"
                    onClick={() => {
                      setDefaultId(o.id);
                      setSaved(false);
                    }}
                    className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold border shrink-0 ${
                      isDefault
                        ? "border-amber-300 bg-amber-50 text-amber-700"
                        : "border-gray-200 text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${isDefault ? "fill-amber-400" : ""}`}
                    />
                    {isDefault ? "پیش‌فرض" : "تنظیم پیش‌فرض"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {saved && !error && (
        <p className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />
          بسته‌بندی‌های محصول ذخیره شد
        </p>
      )}

      {options.length > 0 && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          ذخیره بسته‌بندی‌ها
        </button>
      )}
    </div>
  );
}
