// app/app/dashboard/support/page.tsx
"use client";

import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import { ChevronRight, Plus, Search, Loader2, Inbox } from "lucide-react";
import { useState } from "react";
import { STATUS_META } from "./ticket-meta";

interface TicketListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  lastMessageAt: string;
  category: { name: string };
}

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "همه" },
  ...Object.entries(STATUS_META).map(([key, m]) => ({ key, label: m.label })),
];

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function SupportTicketsPage() {
  const [status, setStatus] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const qs = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(search ? { search } : {}),
  }).toString();

  const { data, isLoading } = useSWR<{ items: TicketListItem[]; total: number }>(
    `/api/support/tickets${qs ? `?${qs}` : ""}`,
    fetcher,
  );

  return (
    <div className="max-w-3xl mx-auto pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[17px] font-black text-gray-900">تیکت‌های پشتیبانی</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {data ? `${data.total.toLocaleString("fa-IR")} تیکت` : "تاریخچه درخواست‌های شما"}
          </p>
        </div>
        <Link
          href="/dashboard/support/new"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white shrink-0"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" />
          تیکت جدید
        </Link>
      </div>

      {/* جستجو */}
      <div className="relative mb-4">
        <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setSearch(searchInput)}
          placeholder="جستجو بر اساس موضوع یا شماره تیکت..."
          className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500"
        />
      </div>

      {/* تب‌های فیلتر */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
              status === f.key ? "text-white shadow-sm" : "text-gray-500 bg-gray-50 hover:bg-gray-100"
            }`}
            style={status === f.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* لیست تیکت‌ها */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
      >
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
          </div>
        ) : !data?.items?.length ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Inbox className="w-10 h-10 text-gray-300" />
            <p className="text-[13px] font-bold text-gray-400">هنوز تیکتی ثبت نکرده‌اید</p>
          </div>
        ) : (
          data.items.map((t, idx) => {
            const meta = STATUS_META[t.status] ?? STATUS_META.OPEN;
            const Icon = meta.icon;
            return (
              <Link
                key={t.id}
                href={`/dashboard/support/${t.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 active:bg-gray-100"
                style={{ borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined }}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ background: meta.bg, color: meta.color }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-800 truncate">{t.subject}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr">
                    {t.ticketNumber} · {t.category?.name}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badgeClass}`}
                >
                  {meta.label}
                </span>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
