"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { adminApi } from "@/app/core/api";
import {
  Loader2,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  AlertCircle,
  Package,
} from "lucide-react";

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

interface VariantItem {
  id: string;
  weightGrams: string;
  priceAdjustmentToman: string;
  finalPriceToman: string;
  stockQuantity: number;
  inStock: boolean;
  sku: string | null;
}

interface ProductWithVariants {
  variants: VariantItem[];
}

interface VariantFormState {
  weightGrams: string;
  priceAdjustmentToman: string;
  stockQuantity: string;
  sku: string;
}

const EMPTY_FORM: VariantFormState = {
  weightGrams: "",
  priceAdjustmentToman: "0",
  stockQuantity: "0",
  sku: "",
};

export default function ProductVariantsManager({
  productId,
}: {
  productId: string;
}) {
  const { data, isLoading, mutate } = useSWR<ProductWithVariants>(
    `/api/admin/shop/products/${productId}`,
    fetcher,
  );

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<VariantFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<VariantFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variants = data?.variants ?? [];

  const resetAddForm = () => {
    setAddForm(EMPTY_FORM);
    setShowAddForm(false);
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const weightGrams = Number(addForm.weightGrams);
    const priceAdjustment = Number(addForm.priceAdjustmentToman) * 10;
    const stockQuantity = Number(addForm.stockQuantity);

    if (!weightGrams || weightGrams <= 0) {
      return setError("وزن باید عددی بزرگتر از صفر باشد");
    }
    if (!Number.isFinite(priceAdjustment)) {
      return setError("مبلغ اختلاف قیمت معتبر نیست");
    }
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return setError("موجودی باید عدد صحیح و غیرمنفی باشد");
    }

    setSaving(true);
    try {
      await adminApi.post(`/api/admin/shop/products/${productId}/variants`, {
        weightGrams,
        priceAdjustment,
        stockQuantity,
        sku: addForm.sku.trim() || undefined,
      });
      await mutate();
      resetAddForm();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در افزودن تنوع"));
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (v: VariantItem) => {
    setError(null);
    setEditingId(v.id);
    setEditForm({
      weightGrams: v.weightGrams,
      priceAdjustmentToman: (
        Number(v.finalPriceToman) -
        (Number(v.finalPriceToman) - Number(v.priceAdjustmentToman))
      ).toString(),
      stockQuantity: String(v.stockQuantity),
      sku: v.sku ?? "",
    });
    // مقدار priceAdjustmentToman مستقیم از بک‌اند در دسترس است، ساده‌تر بنویسیم:
    setEditForm({
      weightGrams: v.weightGrams,
      priceAdjustmentToman: v.priceAdjustmentToman,
      stockQuantity: String(v.stockQuantity),
      sku: v.sku ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
    setError(null);
  };

  const submitEdit = async (id: string) => {
    setError(null);

    const weightGrams = Number(editForm.weightGrams);
    const priceAdjustment = Number(editForm.priceAdjustmentToman) * 10;
    const stockQuantity = Number(editForm.stockQuantity);

    if (!weightGrams || weightGrams <= 0) {
      return setError("وزن باید عددی بزرگتر از صفر باشد");
    }
    if (!Number.isFinite(priceAdjustment)) {
      return setError("مبلغ اختلاف قیمت معتبر نیست");
    }
    if (!Number.isInteger(stockQuantity) || stockQuantity < 0) {
      return setError("موجودی باید عدد صحیح و غیرمنفی باشد");
    }

    setSaving(true);
    try {
      await adminApi.patch(`/api/admin/shop/variants/${id}`, {
        weightGrams,
        priceAdjustment,
        stockQuantity,
        sku: editForm.sku.trim() || undefined,
      });
      await mutate();
      cancelEdit();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره تغییرات"));
    } finally {
      setSaving(false);
    }
  };

  const removeVariant = async (id: string) => {
    if (!confirm("این تنوع حذف شود؟")) return;
    setError(null);
    setSaving(true);
    try {
      await adminApi.delete(`/api/admin/shop/variants/${id}`);
      await mutate();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در حذف تنوع"));
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
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-black text-gray-700">
          تنوع‌های وزنی ثابت
        </h2>
        {!showAddForm && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setShowAddForm(true);
            }}
            className="flex items-center gap-1 text-[12px] font-bold"
            style={{ color: "var(--color-emerald)" }}
          >
            <Plus className="w-3.5 h-3.5" />
            افزودن تنوع
          </button>
        )}
      </div>

      <p className="text-[11px] text-gray-400 -mt-2">
        اختلاف قیمت (مثبت یا منفی) روی قیمت نهاییِ محاسبه‌شده از فرمول
        قیمت‌گذاری اعمال می‌شود.
      </p>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={submitAdd}
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
              value={addForm.weightGrams}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, weightGrams: e.target.value }))
              }
              className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400">
              اختلاف قیمت (ت)
            </label>
            <input
              type="number"
              dir="ltr"
              value={addForm.priceAdjustmentToman}
              onChange={(e) =>
                setAddForm((f) => ({
                  ...f,
                  priceAdjustmentToman: e.target.value,
                }))
              }
              className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400">
              موجودی
            </label>
            <input
              type="number"
              dir="ltr"
              value={addForm.stockQuantity}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, stockQuantity: e.target.value }))
              }
              className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-gray-400">
              SKU (اختیاری)
            </label>
            <input
              dir="ltr"
              value={addForm.sku}
              onChange={(e) =>
                setAddForm((f) => ({ ...f, sku: e.target.value }))
              }
              className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 h-9 rounded-lg text-white flex items-center justify-center disabled:opacity-60"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={resetAddForm}
              disabled={saving}
              className="flex-1 h-9 rounded-lg border border-gray-200 text-gray-500 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : variants.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-gray-300">
          <Package className="w-8 h-8" />
          <p className="text-[12px] text-gray-400">
            هنوز هیچ تنوع وزنی ثبت نشده است
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => {
            const isEditing = editingId === v.id;

            if (isEditing) {
              return (
                <div
                  key={v.id}
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
                      value={editForm.weightGrams}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          weightGrams: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400">
                      اختلاف قیمت (ت)
                    </label>
                    <input
                      type="number"
                      dir="ltr"
                      value={editForm.priceAdjustmentToman}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          priceAdjustmentToman: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400">
                      موجودی
                    </label>
                    <input
                      type="number"
                      dir="ltr"
                      value={editForm.stockQuantity}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          stockQuantity: e.target.value,
                        }))
                      }
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-gray-400">
                      SKU
                    </label>
                    <input
                      dir="ltr"
                      value={editForm.sku}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, sku: e.target.value }))
                      }
                      className="w-full px-2 py-2 rounded-lg border border-gray-200 text-[12px] text-left"
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => submitEdit(v.id)}
                      disabled={saving}
                      className="flex-1 h-9 rounded-lg text-white flex items-center justify-center disabled:opacity-60"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex-1 h-9 rounded-lg border border-gray-200 text-gray-500 flex items-center justify-center"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={v.id}
                className="flex items-center justify-between gap-2 text-[12px] p-3 rounded-lg"
                style={{ backgroundColor: "var(--color-bg-page)" }}
              >
                <span dir="ltr" className="font-bold shrink-0 w-16">
                  {v.weightGrams} گ
                </span>
                <span className="font-bold flex-1 text-center">
                  {Number(v.finalPriceToman).toLocaleString("fa-IR")} ت
                </span>
                <span
                  className="badge shrink-0"
                  style={{
                    background: v.stockQuantity > 0 ? "#dcfce7" : "#fee2e2",
                    color: v.stockQuantity > 0 ? "#16a34a" : "#dc2626",
                  }}
                >
                  {v.stockQuantity.toLocaleString("fa-IR")} عدد
                </span>
                <div className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(v)}
                    className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-200"
                    title="ویرایش"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeVariant(v.id)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                    title="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
