"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  FolderTree,
  Plus,
  X,
  AlertCircle,
  Pencil,
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
  slug: string;
  description: string | null;
  parentId: string | null;
  children?: CategoryItem[];
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
  const [description, setDescription] = useState(editing?.description ?? "");
  const [parentId, setParentId] = useState(editing?.parentId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("نام دسته‌بندی را وارد کنید");
    setLoading(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        parentId: parentId || undefined,
      };
      if (editing) {
        await axios.patch(`/api/admin/shop/categories/${editing.id}`, payload);
      } else {
        await axios.post("/api/admin/shop/categories", payload);
      }
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ثبت دسته‌بندی"));
    } finally {
      setLoading(false);
    }
  };

  const selectableParents = categories.filter((c) => c.id !== editing?.id);

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
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
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
                  <td>
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
                  </td>
                </tr>
              ))}
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
