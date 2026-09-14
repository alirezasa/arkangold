// admin/app/(dashboard)/tickets/categories/page.tsx
"use client";

import useSWR from "swr";
import axios from "axios";
import { useState } from "react";
import { Loader2, Trash2, Plus } from "lucide-react";

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
    <div className="p-6 max-w-xl">
      <h1 className="text-lg font-black text-gray-900 mb-5">دسته‌بندی‌های تیکت</h1>

      <div className="flex gap-2 mb-5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="نام (مثلاً: پشتیبانی فنی)"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-[13px]"
        />
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder="slug (مثلاً: technical)"
          className="w-40 px-3 py-2 rounded-lg border border-gray-200 text-[13px]"
          dir="ltr"
        />
        <button
          onClick={create}
          disabled={creating}
          className="flex items-center gap-1 px-3 py-2 rounded-lg text-[12px] font-bold text-white bg-emerald-600 disabled:opacity-50"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          افزودن
        </button>
      </div>

      {isLoading ? (
        <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
      ) : (
        <div className="flex flex-col gap-2">
          {data?.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-4 py-2.5 rounded-xl border border-gray-100"
            >
              <div>
                <p className="text-[13px] font-bold">{c.name}</p>
                <p className="text-[11px] text-gray-400" dir="ltr">
                  {c.slug}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => toggleActive(c)}
                  className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${
                    c.isActive ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                  }`}
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
