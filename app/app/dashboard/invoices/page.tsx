"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  FileText,
  Loader2,
  Inbox,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
} from "lucide-react";
import {
  useInvoices,
  openInvoicePrint,
  InvoiceSummary,
} from "@/app/hooks/useInvoices";

type Tab = "ALL" | "INVOICE" | "PROFORMA";

const TABS: { key: Tab; label: string }[] = [
  { key: "ALL", label: "همه" },
  { key: "INVOICE", label: "فاکتورهای فروش" },
  { key: "PROFORMA", label: "پیش‌فاکتورها" },
];

const SOURCE_LABEL: Record<string, string> = {
  SHOP_ORDER: "خرید از فروشگاه",
  PHYSICAL_DELIVERY: "تحویل فیزیکی طلا",
  DEPOSIT: "واریز کیف پول",
};

const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  ISSUED: { label: "صادر شده", color: "#2563eb", bg: "#dbeafe", icon: Clock },
  PAID: {
    label: "پرداخت شده",
    color: "#16a34a",
    bg: "#dcfce7",
    icon: CheckCircle2,
  },
  CONSUMED: {
    label: "مصرف شده",
    color: "#16a34a",
    bg: "#dcfce7",
    icon: CheckCircle2,
  },
  EXPIRED: { label: "منقضی شده", color: "#b45309", bg: "#fef3c7", icon: Ban },
  CANCELLED: {
    label: "باطل شده",
    color: "#dc2626",
    bg: "#fee2e2",
    icon: XCircle,
  },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.ISSUED;
  const Icon = meta.icon;
  return (
    <span
      className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold shrink-0"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

function fmtToman(v: string | number) {
  return Math.round(Number(v) / 10).toLocaleString("fa-IR");
}

function InvoiceRow({ invoice }: { invoice: InvoiceSummary }) {
  return (
    <button
      onClick={() => openInvoicePrint(invoice.id)}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-right transition-colors hover:bg-gray-50"
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: "var(--color-emerald-light)" }}
      >
        <FileText className="w-4 h-4" style={{ color: "var(--color-emerald)" }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-[13px] font-bold text-gray-800 truncate">
            {invoice.kind === "PROFORMA" ? "پیش‌فاکتور" : "فاکتور فروش"}{" "}
            <span dir="ltr">{invoice.invoiceNumberFa}</span>
          </p>
        </div>
        <p className="text-[11px] text-gray-400 mt-0.5">
          {SOURCE_LABEL[invoice.sourceType] ?? invoice.sourceType} ·{" "}
          {invoice.issuedAtJalali}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className="text-[12px] font-black text-gray-800">
          {fmtToman(invoice.totalRial)} ت
        </span>
        <StatusBadge status={invoice.status} />
      </div>
    </button>
  );
}

export default function MyInvoicesPage() {
  const [tab, setTab] = useState<Tab>("ALL");
  const { invoices, total, loading } = useInvoices(
    tab === "ALL" ? undefined : tab,
  );

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">فاکتورهای من</h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {total > 0
              ? `${total.toLocaleString("fa-IR")} سند`
              : "فاکتورها و پیش‌فاکتورهای صادر شده برای شما"}
          </p>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all"
            style={
              tab === t.key
                ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                : {
                    backgroundColor: "var(--color-surface)",
                    color: "#6b7280",
                    border: "1px solid var(--color-border)",
                  }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-gray-300" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Inbox className="w-10 h-10 text-gray-300" />
            <p className="text-[13px] font-bold text-gray-400">
              هنوز سندی برای شما صادر نشده است
            </p>
          </div>
        ) : (
          invoices.map((invoice, idx) => (
            <div
              key={invoice.id}
              style={{
                borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined,
              }}
            >
              <InvoiceRow invoice={invoice} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
