// app/app/dashboard/wallet/deposits/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronLeft, FileText, Inbox, Loader2, Plus,
} from "lucide-react";
import { useDeposits, type DepositStatus } from "@/app/hooks/useDeposits";

const TABS: { key: DepositStatus | "ALL"; label: string }[] = [
  { key: "ALL", label: "همه" },
  { key: "PENDING_PAYMENT", label: "در انتظار پرداخت" },
  { key: "RECEIPT_UPLOADED", label: "رسید ارسال شد" },
  { key: "UNDER_REVIEW", label: "در حال بررسی" },
  { key: "APPROVED", label: "تایید شده" },
  { key: "REJECTED", label: "رد شده" },
];

export const STATUS_TONE: Record<DepositStatus, string> = {
  PENDING_PAYMENT: "bg-amber-50 text-amber-700 border-amber-200",
  RECEIPT_UPLOADED: "bg-sky-50 text-sky-700 border-sky-200",
  UNDER_REVIEW: "bg-indigo-50 text-indigo-700 border-indigo-200",
  APPROVED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  CANCELLED: "bg-gray-50 text-gray-500 border-gray-200",
  EXPIRED: "bg-gray-50 text-gray-500 border-gray-200",
};

function faNum(v: string | number) {
  return Number(v).toLocaleString("fa-IR");
}

export default function DepositsListPage() {
  const [tab, setTab] = useState<DepositStatus | "ALL">("ALL");
  const { deposits, loading } = useDeposits(tab === "ALL" ? undefined : tab);

  return (
    <div className="max-w-lg md:max-w-3xl mx-auto px-4 pb-24" dir="rtl">
      <header className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet"
          aria-label="بازگشت به کیف پول"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div className="flex-1">
          <h1 className="text-[17px] font-black text-gray-900">درخواست‌های واریز</h1>
          <p className="text-[11px] text-gray-400">پیگیری واریزهای مبالغ بالا</p>
        </div>
        <Link
          href="/dashboard/wallet/deposit/large-transfer"
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-black text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" />
          درخواست جدید
        </Link>
      </header>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border transition-colors ${
              tab === t.key
                ? "text-white border-transparent"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
            style={tab === t.key ? { backgroundColor: "var(--color-emerald)" } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-300">
          <Loader2 className="w-7 h-7 animate-spin" />
        </div>
      ) : deposits.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Inbox className="w-10 h-10 text-gray-300" />
          <p className="text-[13px] text-gray-500 font-bold">
            هنوز درخواست واریزی ثبت نکرده‌اید
          </p>
          <Link
            href="/dashboard/wallet/deposit/large-transfer"
            className="mt-1 px-5 py-2.5 rounded-xl text-[13px] font-black text-white"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            ثبت اولین درخواست
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {deposits.map((d) => (
            <Link
              key={d.id}
              href={`/dashboard/wallet/deposits/${d.id}`}
              className="block rounded-2xl bg-white border border-gray-100 p-4 hover:border-gray-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-2.5">
                <div>
                  <p className="text-[16px] font-black text-gray-900">
                    {faNum(Number(d.amountRial) / 10)}
                    <span className="text-[11px] font-bold text-gray-400 mr-1">
                      تومان
                    </span>
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {d.requestNumber} · {d.createdAtJalali}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black border ${STATUS_TONE[d.status]}`}
                >
                  {d.statusLabel}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-gray-500 pt-2.5 border-t border-gray-50">
                <span>
                  شناسه واریز:{" "}
                  <bdi dir="ltr" className="font-bold text-gray-700">
                    {d.depositTrackingId}
                  </bdi>
                </span>
                {d.proformaInvoiceId && (
                  <span className="flex items-center gap-1 font-bold">
                    <FileText className="w-3.5 h-3.5" />
                    پیش‌فاکتور
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
