// admin/app/(dashboard)/tickets/categories/page.tsx
"use client";

import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2, Trash2, Plus, Tags } from "lucide-react";

interface Category {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  sortOrder: number;
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function TicketCategoriesPage() {
  const { data, mutate, isLoading } = useSWR<Category[]>("/api/admin/ticket-categories", fetcher);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    try {
      await axios.post("/api/admin/ticket-categories", { name: name.trim(), slug: slug.trim() });
      setName("");
      setSlug("");
      await mutate();
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (c: Category) => {
    await axios.patch(`/api/admin/ticket-categories/${c.id}`, { isActive: !c.isActive });
    await mutate();
  };

  const remove = async (id: string) => {
    if (!confirm("این دسته‌بندی حذف (غیرفعال) شود؟")) return;
    await axios.delete(`/api/admin/ticket-categories/${id}`);
    await mutate();
  };

  return (
    <div className="max-w-xl">
      <h1 className="text-lg font-black text-gray-900 mb-1">دسته‌بندی‌های تیکت</h1>
      <p className="text-[12px] text-gray-400 mb-5">
        {data ? `${data.length.toLocaleString("fa-IR")} دسته‌بندی` : "..."}
      </p>

      <div
        className="flex gap-2 mb-5 p-3 rounded-2xl"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام (مثلاً: پشتیبانی فنی)"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-gold-500"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug (مثلاً: technical)"
          className="w-40 px-3 py-2 rounded-lg border border-gray-200 text-[13px] outline-none focus:border-gold-500"
          dir="ltr"
        />
        <button
          onClick={create}
          disabled={creating}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-[12px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          افزودن
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
        </div>
      ) : !data?.length ? (
        <div className="flex flex-col items-center gap-2 py-10">
          <Tags className="w-8 h-8 text-gray-200" />
          <p className="text-[12px] text-gray-400">دسته‌بندی‌ای ثبت نشده</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-4 py-2.5 rounded-xl"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            >
              <div>
                <p className="text-[13px] font-bold text-gray-900">{c.name}</p>
                <p className="text-[11px] text-gray-400" dir="ltr">
                  {c.slug}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(c)}
                  className="badge"
                  style={
                    c.isActive
                      ? { background: "var(--color-emerald-light)", color: "var(--color-emerald)" }
                      : { background: "#f3f4f6", color: "#6b7280" }
                  }
                >
                  {c.isActive ? "فعال" : "غیرفعال"}
                </button>
                <button onClick={() => remove(c.id)} className="text-gray-400 hover:text-red-500">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
