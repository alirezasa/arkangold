"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { adminApi } from "@/app/core/api";
import {
  Loader2,
  FolderTree,
  Plus,
  X,
  AlertCircle,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import Link from "next/link";

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

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  isActive: boolean;
  children?: CategoryItem[];
  _count?: { products: number; children: number };
}

// اسلاگ رزرو شده برای صفحه «خرید شمش» در اپ — قابل تغییر/حذف نیست
const GOLD_INGOT_CATEGORY_SLUG = "gold-ingot";

// هم‌راستا با CATEGORY_SLUG_PATTERN در بک‌اند
const SLUG_PATTERN = /^[a-z0-9\u0600-\u06FF]+(?:-[a-z0-9\u0600-\u06FF]+)*$/;

function normalizeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0600-\u06FF-]/g, "")
    .replace(/-+/g, "-");
}

function CategoryModal({
  categories,
  editing,
  onClose,
  onDone,
}: {
  categories: CategoryItem[];
  editing: CategoryItem | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [slug, setSlug] = useState(editing?.slug ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [parentId, setParentId] = useState(editing?.parentId ?? "");
  const [isActive, setIsActive] = useState(editing?.isActive ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slugLocked = editing?.slug === GOLD_INGOT_CATEGORY_SLUG;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("نام دسته‌بندی را وارد کنید");
    const cleanSlug = slug.replace(/^-+|-+$/g, "");
    if (editing && !cleanSlug) return setError("اسلاگ را وارد کنید");
    if (cleanSlug && (cleanSlug.length < 2 || !SLUG_PATTERN.test(cleanSlug)))
      return setError(
        "اسلاگ فقط می‌تواند شامل حروف کوچک انگلیسی، ارقام، حروف فارسی و خط تیره باشد",
      );
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        slug: cleanSlug || undefined,
        description: description.trim() || undefined,
        // در ویرایش، null یعنی انتقال به سطح اول
        parentId: parentId || (editing ? null : undefined),
        isActive,
      };
      if (editing) {
        await adminApi.patch(
          `/api/admin/shop/categories/${editing.id}`,
          payload,
        );
      } else {
        await adminApi.post("/api/admin/shop/categories", payload);
      }
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ثبت دسته‌بندی"));
    } finally {
      setLoading(false);
    }
  };

  const selectableParents = categories.filter(
    (c) => c.id !== editing?.id && c.parentId !== editing?.id,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">
            {editing ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"}
          </h2>
          <button type="button" onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <input
          placeholder="نام دسته‌بندی"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500"
        />
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-gray-500">
            اسلاگ (آدرس URL)
          </label>
          <input
            dir="ltr"
            placeholder={editing ? "" : "خالی = ساخت خودکار از روی نام"}
            value={slug}
            disabled={slugLocked}
            onChange={(e) => setSlug(normalizeSlug(e.target.value))}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 text-left disabled:bg-gray-100 disabled:text-gray-400"
          />
          <p className="text-[10px] text-gray-400">
            {slugLocked
              ? "این اسلاگ توسط صفحه خرید شمش در اپ استفاده می‌شود و قابل تغییر نیست"
              : "مثال: gold-ring — فقط حروف کوچک انگلیسی، ارقام، حروف فارسی و خط تیره"}
          </p>
        </div>
        <textarea
          placeholder="توضیحات (اختیاری)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-gold-500 resize-none"
        />
        <select
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm"
        >
          <option value="">بدون دسته والد (سطح اول)</option>
          {selectableParents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <label className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-gray-200 cursor-pointer">
          <span className="text-sm text-gray-700">
            {isActive ? "فعال — در فروشگاه نمایش داده می‌شود" : "غیرفعال — در فروشگاه مخفی است"}
          </span>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="w-4 h-4 accent-emerald-600"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : editing ? (
            "ذخیره تغییرات"
          ) : (
            "ایجاد دسته‌بندی"
          )}
        </button>
      </form>
    </div>
  );
}

export default function CategoriesPage() {
  const { data, isLoading, mutate } = useSWR<CategoryItem[]>(
    "/api/admin/shop/categories",
    fetcher,
  );
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CategoryItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const toggleActive = async (c: CategoryItem) => {
    if (
      c.isActive &&
      !confirm(
        `دسته «${c.name}» غیرفعال شود؟ محصولات این دسته در فروشگاه نمایش داده نمی‌شوند و قابل خرید نخواهند بود.`,
      )
    )
      return;
    setBusyId(c.id);
    setActionError(null);
    try {
      await adminApi.patch(`/api/admin/shop/categories/${c.id}`, {
        isActive: !c.isActive,
      });
      await mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در تغییر وضعیت دسته‌بندی"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: CategoryItem) => {
    if (!confirm(`دسته «${c.name}» برای همیشه حذف شود؟`)) return;
    setBusyId(c.id);
    setActionError(null);
    try {
      await adminApi.delete(`/api/admin/shop/categories/${c.id}`);
      await mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در حذف دسته‌بندی"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-black text-gray-900">
          دسته‌بندی‌های فروشگاه
        </h1>
        <button
          onClick={() => {
            setEditing(null);
            setShowModal(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-bold"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" /> دسته‌بندی جدید
        </button>
      </div>

      {actionError && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span className="flex-1">{actionError}</span>
          <button onClick={() => setActionError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <FolderTree className="w-8 h-8 text-gray-200" />
          <p className="text-[12px] text-gray-400">دسته‌بندی‌ای ثبت نشده است</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th>نام</th>
                <th>اسلاگ</th>
                <th>زیردسته‌ها</th>
                <th>محصولات</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => {
                const isReserved = c.slug === GOLD_INGOT_CATEGORY_SLUG;
                const productCount = c._count?.products ?? 0;
                const childCount = c._count?.children ?? c.children?.length ?? 0;
                const canDelete = !isReserved && productCount === 0 && childCount === 0;
                const busy = busyId === c.id;
                return (
                  <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                    <td>
                      <Link
                        href={`/shop/products?categoryId=${c.id}`}
                        className="font-bold hover:underline"
                        style={{ color: "var(--color-emerald)" }}
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td dir="ltr" className="text-left text-gray-400">
                      {c.slug}
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {c.children?.length
                        ? c.children.map((ch) => ch.name).join("، ")
                        : "—"}
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {productCount.toLocaleString("fa-IR")}
                    </td>
                    <td>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                          c.isActive
                            ? "bg-green-50 text-green-600"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {c.isActive ? "فعال" : "غیرفعال"}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditing(c);
                            setShowModal(true);
                          }}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                          title="ویرایش"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(c)}
                          disabled={busy}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-40"
                          title={c.isActive ? "غیرفعال کردن" : "فعال کردن"}
                        >
                          {busy ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : c.isActive ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => remove(c)}
                          disabled={busy || !canDelete}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                          title={
                            isReserved
                              ? "این دسته توسط صفحه خرید شمش استفاده می‌شود"
                              : productCount > 0
                                ? "دسته دارای محصول است؛ ابتدا محصولات را منتقل کنید یا دسته را غیرفعال کنید"
                                : childCount > 0
                                  ? "دسته دارای زیردسته است"
                                  : "حذف"
                          }
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <CategoryModal
          categories={data ?? []}
          editing={editing}
          onClose={() => setShowModal(false)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}
