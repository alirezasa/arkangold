"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useTransactions,
  useTransactionsSummary,
  TxFilter,
  TransactionItem,
} from "@/app/hooks/useTransactions";
import {
  ChevronRight,
  ChevronLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Receipt,
  Percent,
  Package,
  Gift,
  Loader2,
  AlertCircle,
  Inbox,
  X,
} from "lucide-react";

// ── نگاشت دسته‌بندی تراکنش به آیکون و رنگ ──
const CATEGORY_STYLE: Record<
  string,
  { bg: string; color: string; icon: React.ElementType }
> = {
  buy: { bg: "#dcfce7", color: "#16a34a", icon: ArrowDownCircle },
  sell: { bg: "#fee2e2", color: "#dc2626", icon: ArrowUpCircle },
  deposit: { bg: "#dbeafe", color: "#2563eb", icon: Wallet },
  withdrawal: { bg: "#fef3c7", color: "#b45309", icon: Wallet },
  fee: { bg: "#f3e8ff", color: "#9333ea", icon: Percent },
  shop: { bg: "#ffe4e6", color: "#e11d48", icon: Package },
  physical: { bg: "#fef9c3", color: "#a16207", icon: Package },
  other: { bg: "#f1f5f9", color: "#64748b", icon: Gift },
};

const FILTERS: { key: TxFilter; label: string }[] = [
  { key: "ALL", label: "همه" },
  { key: "BUY_GOLD", label: "خرید" },
  { key: "SELL_GOLD", label: "فروش" },
  { key: "DEPOSIT", label: "واریز" },
  { key: "WITHDRAWAL", label: "برداشت" },
];

function toToman(rial: number | string | null) {
  const n = Number(rial ?? 0);
  return n.toLocaleString("fa-IR");
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function TxIcon({ category }: { category: string }) {
  const s = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other;
  const Icon = s.icon;
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      <Icon className="w-5 h-5" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { text: string; cls: string }> = {
    COMPLETED: {
      text: "تکمیل شده",
      cls: "bg-green-50 text-green-700 border-green-200",
    },
    PENDING: {
      text: "در انتظار",
      cls: "bg-amber-50 text-amber-700 border-amber-200",
    },
    FAILED: { text: "ناموفق", cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span
      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.cls}`}
    >
      {s.text}
    </span>
  );
}

// ── مودال جزئیات تراکنش ──
function TxDetailModal({
  tx,
  onClose,
}: {
  tx: TransactionItem;
  onClose: () => void;
}) {
  const { date, time } = formatDateTime(tx.createdAt);
  const s = CATEGORY_STYLE[tx.category] ?? CATEGORY_STYLE.other;

  const rows = [
    tx.amountGrams && { label: "مقدار طلا", value: `${tx.amountGrams} گرم` },
    tx.pricePerGramToman && {
      label: "قیمت هر گرم",
      value: `${toToman(tx.pricePerGramToman)} تومان`,
    },
    tx.amountToman && {
      label: tx.sign === "plus" ? "مبلغ دریافتی" : "مبلغ پرداختی",
      value: `${toToman(tx.amountToman)} تومان`,
      big: true,
    },
    tx.feeToman &&
      Number(tx.feeToman) > 0 && {
        label: "کارمزد",
        value: `${toToman(tx.feeToman)} تومان`,
      },
    tx.taxToman &&
      Number(tx.taxToman) > 0 && {
        label: "مالیات",
        value: `${toToman(tx.taxToman)} تومان`,
      },
    { label: "تاریخ", value: `${date} - ${time}` },
    { label: "شناسه تراکنش", value: tx.id.slice(0, 8) + "…" },
  ].filter(Boolean) as { label: string; value: string; big?: boolean }[];

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-3">
            <TxIcon category={tx.category} />
            <div>
              <h3 className="text-[14px] font-black text-gray-900">
                {tx.title}
              </h3>
              <StatusBadge status={tx.status} />
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          className="rounded-xl overflow-hidden m-4 border"
          style={{ borderColor: "var(--color-border)" }}
        >
          {rows.map((row, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-4 py-3.5 border-t first:border-t-0 ${
                row.big ? "bg-gray-50" : "bg-white"
              }`}
              style={{ borderColor: "var(--color-border)" }}
            >
              <span className="text-[12px] text-gray-500 font-medium">
                {row.label}
              </span>
              <span
                className={
                  row.big
                    ? "text-[16px] font-black text-gray-900"
                    : "text-[13px] font-bold text-gray-700"
                }
                dir={row.label === "شناسه تراکنش" ? "ltr" : undefined}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {tx.description && (
          <p className="px-5 pb-4 text-[11px] text-gray-400">
            {tx.description}
          </p>
        )}

        <div className="p-4 pt-0">
          <button
            onClick={onClose}
            className="w-full py-3.5 rounded-xl font-black text-white text-[14px]"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TransactionsPage() {
  const [filter, setFilter] = useState<TxFilter>("ALL");
  const [page, setPage] = useState(1);
  const [selectedTx, setSelectedTx] = useState<TransactionItem | null>(null);

  const { summary } = useTransactionsSummary();
  const { transactions, totalPages, total, loading, error } = useTransactions(
    page,
    filter,
  );

  const handleFilterChange = (f: TxFilter) => {
    setFilter(f);
    setPage(1);
  };

  return (
    <div className="max-w-3xl mx-auto pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">تراکنش‌ها</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {total > 0
              ? `${total.toLocaleString("fa-IR")} تراکنش`
              : "تاریخچه کامل فعالیت‌های مالی"}
          </p>
        </div>
      </div>

      {/* کارت‌های آماری خلاصه */}
      {summary && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-1.5 text-blue-600">
              <Wallet className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold text-gray-500">
                واریز این ماه
              </span>
            </div>
            <p className="text-[15px] font-black text-gray-800">
              {toToman(summary.monthDepositRial / 10)}
              <span className="text-[10px] font-normal text-gray-400 mr-1">
                تومان
              </span>
            </p>
          </div>
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-1.5 text-amber-600">
              <Receipt className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold text-gray-500">
                برداشت این ماه
              </span>
            </div>
            <p className="text-[15px] font-black text-gray-800">
              {toToman(summary.monthWithdrawalRial / 10)}
              <span className="text-[10px] font-normal text-gray-400 mr-1">
                تومان
              </span>
            </p>
          </div>
        </div>
      )}

      {/* تب‌های فیلتر */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
              filter === f.key
                ? "text-white shadow-sm"
                : "text-gray-500 bg-gray-50 hover:bg-gray-100"
            }`}
            style={
              filter === f.key
                ? { backgroundColor: "var(--color-emerald)" }
                : undefined
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* خطا */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* لیست تراکنش‌ها */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Inbox className="w-10 h-10 text-gray-300" />
            <p className="text-[13px] font-bold text-gray-400">
              تراکنشی یافت نشد
            </p>
          </div>
        ) : (
          transactions.map((tx, idx) => {
            const { date, time } = formatDateTime(tx.createdAt);
            return (
              <button
                key={tx.id}
                onClick={() => setSelectedTx(tx)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right transition-colors hover:bg-gray-50 active:bg-gray-100"
                style={{
                  borderTop:
                    idx > 0 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                <TxIcon category={tx.category} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-[13px] font-bold text-gray-800 truncate">
                      {tx.title}
                    </p>
                    {tx.status !== "COMPLETED" && (
                      <StatusBadge status={tx.status} />
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    {date} · {time}
                  </p>
                </div>
                <div className="text-left shrink-0">
                  {tx.amountGrams && (
                    <p
                      className="text-[13px] font-black"
                      style={{
                        color:
                          tx.sign === "plus"
                            ? "#16a34a"
                            : "var(--color-red, #dc2626)",
                      }}
                    >
                      {tx.sign === "plus" ? "+" : "-"}
                      {tx.amountGrams} گ
                    </p>
                  )}
                  {tx.amountToman && (
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {toToman(tx.amountToman)} ت
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* صفحه‌بندی */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-[12px] font-bold text-gray-500 px-2">
            صفحه {page.toLocaleString("fa-IR")} از{" "}
            {totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}

      {selectedTx && (
        <TxDetailModal tx={selectedTx} onClose={() => setSelectedTx(null)} />
      )}
    </div>
  );
}
