// app/app/dashboard/support/page.tsx
"use client";

import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import { Loader2, Plus, Search } from "lucide-react";
import { useState } from "react";

const STATUS_FA: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  WAITING_FOR_USER: "در انتظار پاسخ شما",
  RESOLVED: "حل شده",
  CLOSED: "بسته شده",
  REOPENED: "بازگشایی شده",
};

const STATUS_COLOR: Record<string, string> = {
  OPEN: "#2563eb",
  IN_PROGRESS: "#d97706",
  WAITING_FOR_USER: "#7c3aed",
  RESOLVED: "#16a34a",
  CLOSED: "#6b7280",
  REOPENED: "#dc2626",
};

interface TicketListItem {
  id: string;
  ticketNumber: string;
  subject: string;
  status: string;
  priority: string;
  lastMessageAt: string;
  category: { name: string };
}

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function SupportTicketsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useSWR<{ items: TicketListItem[]; total: number }>(
    `/api/support/tickets${search ? `?search=${encodeURIComponent(search)}` : ""}`,
    fetcher,
  );

  return (
    <div dir="rtl" className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-lg font-black text-gray-900">تیکت‌های من</h1>
        <Link
          href="/dashboard/support/new"
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white bg-emerald-600"
        >
          <Plus className="w-4 h-4" />
          تیکت جدید
        </Link>
      </div>

      <div className="relative mb-4">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو بر اساس موضوع یا شماره تیکت..."
          className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 text-[13px] outline-none focus:border-emerald-500"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data?.items?.length ? (
        <div className="text-center py-16 text-gray-400 text-[13px]">
          هنوز تیکتی ثبت نکرده‌اید.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {data.items.map((t) => (
            <Link
              key={t.id}
              href={`/dashboard/support/${t.id}`}
              className="flex items-center justify-between px-4 py-3.5 rounded-xl border border-gray-100 bg-white hover:border-emerald-300 transition-colors"
            >
              <div>
                <p className="text-[13px] font-bold text-gray-900">{t.subject}</p>
                <p className="text-[11px] text-gray-400 mt-1" dir="ltr">
                  {t.ticketNumber} · {t.category?.name}
                </p>
              </div>
              <span
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg text-white shrink-0"
                style={{ backgroundColor: STATUS_COLOR[t.status] ?? "#6b7280" }}
              >
                {STATUS_FA[t.status] ?? t.status}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
