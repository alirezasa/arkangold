// admin/app/components/UserPicker.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Plus, Search, X } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export interface UserSearchItem {
  id: string;
  phone: string;
}

/** انتخاب چند کاربر با جستجوی شماره موبایل (حداقل ۳ رقم) */
export default function UserPicker({
  selected,
  onAdd,
  onRemove,
}: {
  selected: UserSearchItem[];
  onAdd: (u: UserSearchItem) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useSWR(
    q.trim().length >= 3
      ? `/api/admin/users?search=${encodeURIComponent(q.trim())}&limit=8`
      : null,
    fetcher,
  );
  const results: UserSearchItem[] = data?.data ?? [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجو با شماره موبایل (حداقل ۳ رقم)"
          className="w-full px-3 py-2.5 pr-9 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          dir="ltr"
        />
      </div>
      {results.length > 0 && (
        <div className="rounded-xl border border-gray-100 divide-y max-h-40 overflow-y-auto">
          {results.map((u) => {
            const already = selected.some((s) => s.id === u.id);
            return (
              <button
                type="button"
                key={u.id}
                disabled={already}
                onClick={() => {
                  onAdd(u);
                  setQ("");
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-bold disabled:opacity-40"
              >
                <span dir="ltr">{u.phone}</span>
                {already ? (
                  <span className="text-[11px] text-gray-400">افزوده شده</span>
                ) : (
                  <Plus className="w-4 h-4 text-emerald-600" />
                )}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {selected.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold"
              style={{ backgroundColor: "#f3f4f6", color: "#374151" }}
            >
              <span dir="ltr">{u.phone}</span>
              <button type="button" onClick={() => onRemove(u.id)}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
