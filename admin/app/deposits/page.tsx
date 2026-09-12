// admin/app/deposits/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import { Loader2, Search } from "lucide-react";

type Status =
  | "PENDING_PAYMENT" | "RECEIPT_UPLOADED" | "UNDER_REVIEW"
  | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";

interface Row {
  id: string;
  requestNumber: string;
  amountRial: string;
  status: Status;
  statusLabel: string;
  depositTrackingId: string;
  receiptCount: number;
  createdAtJalali: string;
  user: {
    id: string;
    phone: string;
    displayName: string;
    nationalCode: string | null;
  };
}

const TABS: { key: Status | "ALL"; label: string }[] = [
  { key: "RECEIPT_UPLOADED", label: "رسید ارسال‌شده" },
  { key: "UNDER_REVIEW", label: "در حال بررسی" },
  { key: "PENDING_PAYMENT", label: "در انتظار پرداخت" },
  { key: "APPROVED", label: "تایید شده" },
  { key: "REJECTED", label: "رد شده" },
  { key: "ALL", label: "همه" },
];

const TONE: Record<Status, string> = {
  PENDING_PAYMENT: "bg-amber-50 text-amber-700 border-amber-200",
  RECEIPT_UPLOADED: "bg-sky-50 text-sky-700 border-sky-200",
  UNDER_REVIEW: "bg-indigo-50 text-indigo-700 border-indigo-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-gray-50 text-gray-500 border-gray-200",
  EXPIRED: "bg-gray-50 text-gray-500 border-gray-200",
};

const fetcher = (url: string) => axios.get(url).then((r) => r.data);
const faNum = (v: string | number) => Number(v).toLocaleString("fa-IR");

export default function AdminDepositsPage() {
  const [tab, setTab] = useState<Status | "ALL">("RECEIPT_UPLOADED");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const qs = new URLSearchParams();
  if (tab !== "ALL") qs.set("status", tab);
  if (search) qs.set("q", search);

  const { data, isLoading } = useSWR<{
    items: Row[];
    total: number;
    statusCounts: Record<string, number>;
  }>(`/api/admin/deposits?${qs}`, fetcher, { refreshInterval: 30_000 });

  return (
    <div dir="rtl" className="p-6">
      <header className="mb-5">
        <h1 className="text-[19px] font-black text-gray-900">درخواست‌های واریز</h1>
        <p className="text-[12px] text-gray-400 mt-1">
          بررسی رسیدها و شارژ کیف پول کاربران
        </p>
      </header>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {TABS.map((t) => {
          const count = t.key !== "ALL" ? data?.statusCounts?.[t.key] : undefined;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 rounded-xl text-[12px] font-bold border flex items-center gap-2 ${
                tab === t.key
                  ? "text-white border-transparent"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
              style={tab === t.key ? { backgroundColor: "var(--color-emerald)" } : {}}
            >
              {t.label}
              {!!count && (
                <span
                  className={`px-1.5 rounded-md text-[10px] font-black ${
                    tab === t.key ? "bg-white/20" : "bg-red-500 text-white"
                  }`}
                >
                  {faNum(count)}
                </span>
              )}
            </button>
          );
        })}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
          className="mr-auto relative"
        >
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="شناسه واریز، موبایل، شماره سند"
            className="w-72 pr-9 pl-3 py-2 rounded-xl border border-gray-200 text-[12px] outline-none focus:border-gray-400"
          />
        </form>
      </div>

      <div className="rounded-2xl bg-white border border-gray-100 overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-16 text-gray-300">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !data?.items.length ? (
          <p className="text-center py-16 text-[13px] text-gray-400">
            درخواستی در این وضعیت وجود ندارد
          </p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="text-right px-4 py-3 font-bold">کاربر</th>
                <th className="text-right px-4 py-3 font-bold">مبلغ</th>
                <th className="text-right px-4 py-3 font-bold">شناسه واریز</th>
                <th className="text-right px-4 py-3 font-bold">تاریخ</th>
                <th className="text-right px-4 py-3 font-bold">رسید</th>
                <th className="text-right px-4 py-3 font-bold">وضعیت</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <p className="font-bold text-gray-800">
                      {r.user.displayName || "—"}
                    </p>
                    <bdi dir="ltr" className="text-[11px] text-gray-400">
                      {r.user.phone}
                    </bdi>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black text-gray-900">
                      {faNum(Number(r.amountRial) / 10)}
                      <span className="text-[10px] text-gray-400 mr-1">تومان</span>
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <bdi dir="ltr" className="font-bold text-gray-700">
                      {r.depositTrackingId}
                    </bdi>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{r.createdAtJalali}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.receiptCount ? `${faNum(r.receiptCount)} فایل` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${TONE[r.status]}`}
                    >
                      {r.statusLabel}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-left">
                    <Link
                      href={`/deposits/${r.id}`}
                      className="px-3.5 py-1.5 rounded-lg text-[11px] font-black text-white inline-block"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      بررسی
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
