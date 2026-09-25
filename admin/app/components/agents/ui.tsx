// admin/app/components/agents/ui.tsx
//
// اجزا و توابع مشترک صفحات نمایندگان (مدیریت و پرتال نماینده).
"use client";
import axios from "axios";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";

export const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (data?.message) return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

/** ریال → نمایش تومان با ارقام فارسی */
export const toman = (rial: string | number | null | undefined) =>
  rial == null || rial === "" ? "—" : Math.round(Number(rial) / 10).toLocaleString("fa-IR");

export const faNum = (n: string | number | null | undefined, digits = 3) =>
  n == null || n === "" ? "—" : Number(n).toLocaleString("fa-IR", { maximumFractionDigits: digits });

export const faDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("fa-IR") : "—";

export const faDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export const inputCls =
  "w-full mt-1 px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm bg-white";

export const cardStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
};

export const primaryBtn =
  "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-black text-white disabled:opacity-50";
export const primaryBtnStyle = { backgroundColor: "var(--color-emerald)" };
export const secondaryBtn =
  "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700 disabled:opacity-50";

// ─────────────────────────── برچسب‌ها ───────────────────────────

export const AGENT_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "فعال", cls: "bg-green-50 text-green-700" },
  SUSPENDED: { label: "تعلیق", cls: "bg-amber-50 text-amber-700" },
  TERMINATED: { label: "خاتمه همکاری", cls: "bg-gray-100 text-gray-500" },
};

export const COMMISSION_TYPE_FA: Record<string, string> = {
  PERCENT: "درصد از مبلغ فروش",
  PER_GRAM: "مبلغ ثابت به ازای هر گرم",
  FIXED_PER_BAR: "مبلغ ثابت به ازای هر شمش",
};

export function commissionLabel(type: string, value: string | number) {
  if (type === "PERCENT") return `${faNum(value, 2)}٪ مبلغ فروش`;
  if (type === "PER_GRAM") return `${toman(value)} تومان / گرم`;
  return `${toman(value)} تومان / شمش`;
}

export const SETTLEMENT_METHOD_FA: Record<string, string> = {
  CASH: "نقدی",
  BANK_TRANSFER: "واریز بانکی (پایا/ساتنا)",
  CARD_TO_CARD: "کارت به کارت",
  POS: "کارتخوان",
  CHEQUE: "چک",
};

export const SALE_PAYMENT_FA: Record<string, string> = {
  CASH: "نقدی",
  POS: "کارتخوان",
  CARD_TO_CARD: "کارت به کارت",
  BANK_TRANSFER: "واریز بانکی",
  CHEQUE: "چک",
};

export const SETTLEMENT_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "در انتظار تأیید", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "تأییدشده", cls: "bg-green-50 text-green-700" },
  REJECTED: { label: "ردشده", cls: "bg-red-50 text-red-600" },
};

export const SALE_STATUS: Record<string, { label: string; cls: string }> = {
  COMPLETED: { label: "قطعی", cls: "bg-green-50 text-green-700" },
  VOIDED: { label: "ابطال‌شده", cls: "bg-red-50 text-red-600" },
};

export const MOVEMENT_TYPE: Record<string, { label: string; cls: string }> = {
  ALLOCATION: { label: "تحویل امانی", cls: "bg-blue-50 text-blue-700" },
  RETURN: { label: "عودت به خزانه", cls: "bg-gray-100 text-gray-600" },
  SALE: { label: "فروش", cls: "bg-green-50 text-green-700" },
  SALE_VOID: { label: "ابطال فروش", cls: "bg-red-50 text-red-600" },
};

export const LEDGER_TYPE_FA: Record<string, string> = {
  SALE: "فروش",
  SALE_VOID: "ابطال فروش",
  SETTLEMENT: "تسویه",
  ADJUSTMENT: "اصلاحیه",
};

export const PURITY_FA: Record<string, string> = { K18: "۱۸ عیار", K24: "۲۴ عیار" };

// ─────────────────────────── اجزا ───────────────────────────

export function Badge({ map, value }: { map: Record<string, { label: string; cls: string }>; value: string }) {
  const m = map[value] ?? { label: value, cls: "bg-gray-100 text-gray-600" };
  return <span className={`badge ${m.cls}`}>{m.label}</span>;
}

export function Alert({ kind, text }: { kind: "error" | "success" | "warn" | "info"; text: string }) {
  const cls =
    kind === "error"
      ? "bg-red-50 border-red-100 text-red-600"
      : kind === "success"
        ? "bg-green-50 border-green-100 text-green-700"
        : kind === "info"
          ? "bg-blue-50 border-blue-100 text-blue-700"
          : "bg-amber-50 border-amber-100 text-amber-700";
  const Icon = kind === "success" ? CheckCircle2 : AlertCircle;
  return (
    <div className={`flex items-start gap-2 p-3 rounded-xl border text-[12px] font-bold ${cls}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <span className="whitespace-pre-line">{text}</span>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="text-center text-[12px] text-gray-400 py-8">{text}</p>;
}

export function Kpi({
  title,
  value,
  hint,
  color = "var(--color-emerald)",
  icon: Icon,
}: {
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  color?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="rounded-2xl p-4 flex items-start justify-between gap-3" style={cardStyle}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold text-gray-500 mb-1.5">{title}</p>
        <p className="text-[18px] font-black text-gray-900 leading-tight">{value}</p>
        {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
      </div>
      {Icon && (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`, color }}
        >
          <Icon className="w-5 h-5" />
        </div>
      )}
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center p-0 sm:p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`relative w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 space-y-4`}
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-black text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600" aria-label="بستن">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
        aria-label="صفحه قبل"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
      <span className="text-[12px] font-bold text-gray-600">
        صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="p-2 rounded-lg border border-gray-200 bg-white disabled:opacity-40"
        aria-label="صفحه بعد"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="text-[12px] font-bold text-gray-600">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

/** خروجی CSV با BOM تا اکسل فارسی را درست نمایش دهد */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** تومان واردشده توسط کاربر → ریال برای API */
export const tomanToRial = (v: string) => Math.round(Number(v.replace(/[,،\s]/g, "")) * 10);
