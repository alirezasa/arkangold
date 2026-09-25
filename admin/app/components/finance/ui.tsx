// admin/app/components/finance/ui.tsx
//
// اجزا و برچسب‌های مشترک صفحات حسابداری پیشرفته، خزانه، موجودی شمش و شرکای فروش.
// اجزای پایه (Modal، Kpi، Pagination، ...) از کیت صفحات نمایندگان استفاده می‌شوند.
"use client";
import { useState } from "react";
import axios from "axios";
import useSWR from "swr";
import { Download, Loader2 } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { fetcher, getErrorMessage, inputCls, primaryBtn, primaryBtnStyle, secondaryBtn } from "@/app/components/agents/ui";

export {
  Alert,
  Badge,
  Empty,
  Field,
  Kpi,
  Modal,
  Pagination,
  Spinner,
  cardStyle,
  downloadCsv,
  faDate,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
  tomanToRial,
  SETTLEMENT_METHOD_FA,
} from "@/app/components/agents/ui";

// ─────────────────────────── قالب‌بندی ───────────────────────────

/** گرم با حداکثر ۴ رقم اعشار */
export const grams = (v: string | number | null | undefined) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("fa-IR", { maximumFractionDigits: 4 });

/** مبلغ ریالی با علامت (برای مانده‌ها) به تومان */
export const signedToman = (rial: string | number | null | undefined) => {
  if (rial == null || rial === "") return "—";
  const n = Math.round(Number(rial) / 10);
  return n < 0 ? `(${Math.abs(n).toLocaleString("fa-IR")})` : n.toLocaleString("fa-IR");
};

export const todayIso = () => new Date().toISOString().slice(0, 10);
export const monthStartIso = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export function usePerm() {
  const { me } = useAdminMe();
  return (key: string) => me?.permissions.includes(key) ?? false;
}

// ─────────────────────────── برچسب‌ها ───────────────────────────

export const ACCOUNT_TYPE_FA: Record<string, string> = {
  ASSET: "دارایی",
  LIABILITY: "بدهی",
  EQUITY: "حقوق صاحبان سهام",
  INCOME: "درآمد",
  EXPENSE: "هزینه",
};

export const SOURCE: Record<string, { label: string; cls: string }> = {
  SYSTEM: { label: "سیستمی", cls: "bg-gray-100 text-gray-600" },
  MANUAL: { label: "دستی", cls: "bg-blue-50 text-blue-700" },
  OPENING: { label: "افتتاحیه", cls: "bg-indigo-50 text-indigo-700" },
  CLOSING: { label: "اختتامیه", cls: "bg-purple-50 text-purple-700" },
  REVALUATION: { label: "ارزیابی طلا", cls: "bg-amber-50 text-amber-700" },
  REVERSAL: { label: "برگشتی", cls: "bg-red-50 text-red-600" },
  TREASURY: { label: "خزانه", cls: "bg-yellow-50 text-yellow-800" },
  PARTNER: { label: "شرکای فروش", cls: "bg-teal-50 text-teal-700" },
  INVENTORY: { label: "موجودی شمش", cls: "bg-orange-50 text-orange-700" },
};

export const VOUCHER_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "در انتظار تأیید", cls: "bg-amber-50 text-amber-700" },
  POSTED: { label: "ثبت‌شده", cls: "bg-green-50 text-green-700" },
  REJECTED: { label: "ردشده", cls: "bg-red-50 text-red-600" },
  CANCELLED: { label: "ابطال‌شده", cls: "bg-gray-100 text-gray-500" },
  REVERSED: { label: "برگشت‌خورده", cls: "bg-purple-50 text-purple-700" },
};

export const VOUCHER_TYPE_FA: Record<string, string> = {
  GENERAL: "عمومی",
  OPENING: "افتتاحیه",
  EXPENSE: "هزینه",
  ADJUSTMENT: "اصلاحی",
};

export const TREASURY_STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: "پیش‌نویس", cls: "bg-gray-100 text-gray-600" },
  CONFIRMED: { label: "قطعی — در راه", cls: "bg-amber-50 text-amber-700" },
  RECEIVED: { label: "تحویل‌شده", cls: "bg-green-50 text-green-700" },
  CANCELLED: { label: "ابطال‌شده", cls: "bg-red-50 text-red-600" },
};

export const ASSET_FA: Record<string, string> = {
  MELTED_GOLD: "طلای آب‌شده",
  BULLION: "شمش",
};

export const SUPPLIER_KIND_FA: Record<string, string> = {
  MELTED_GOLD_DEALER: "بنکدار طلای آب‌شده",
  MINT: "ضرابخانه / تولیدکننده شمش",
  REFINERY: "پالایشگاه / ری‌گیری",
  BANK: "بانک / بورس کالا",
  OTHER: "سایر",
};

export const PARTNER_KIND_FA: Record<string, string> = {
  BNPL: "خرید اقساطی (BNPL)",
  RESELLER_APP: "اپلیکیشن همکار",
  MARKETPLACE: "فروشگاه اینترنتی",
  CORPORATE: "سازمانی",
  OTHER: "سایر",
};

export const PARTNER_STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "فعال", cls: "bg-green-50 text-green-700" },
  SUSPENDED: { label: "تعلیق", cls: "bg-amber-50 text-amber-700" },
  TERMINATED: { label: "خاتمه همکاری", cls: "bg-gray-100 text-gray-500" },
};

export const PARTNER_ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "در انتظار تأیید شریک", cls: "bg-amber-50 text-amber-700" },
  CONFIRMED: { label: "تأییدشده — تسویه‌نشده", cls: "bg-blue-50 text-blue-700" },
  SETTLED: { label: "تسویه‌شده", cls: "bg-green-50 text-green-700" },
  CANCELLED: { label: "لغوشده", cls: "bg-gray-100 text-gray-500" },
  REFUNDED: { label: "مستردشده", cls: "bg-red-50 text-red-600" },
};

// ─────────────────────────── اجزا ───────────────────────────

export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Icon className="w-5 h-5" /> {title}
        </h1>
        {subtitle && <p className="text-[12px] text-gray-400 mt-1 max-w-3xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function DateRange({
  from,
  to,
  onFrom,
  onTo,
  children,
}: {
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  children?: React.ReactNode;
}) {
  const cls = "block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-[12px] font-bold text-gray-600">
        از تاریخ
        <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={cls} dir="ltr" />
      </label>
      <label className="text-[12px] font-bold text-gray-600">
        تا تاریخ
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className={cls} dir="ltr" />
      </label>
      {children}
    </div>
  );
}

export function CsvButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={secondaryBtn}>
      <Download className="w-4 h-4" /> خروجی اکسل
    </button>
  );
}

export interface AccountOption {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
  allowManualEntry: boolean;
  parentCode: string | null;
}

/** فهرست حساب‌ها (کش SWR مشترک بین صفحات) */
export function useAccounts() {
  return useSWR<AccountOption[]>("/api/admin/accounting/accounts", fetcher);
}

export function AccountSelect({
  value,
  onChange,
  filter,
  placeholder = "انتخاب حساب",
}: {
  value: string;
  onChange: (code: string) => void;
  filter?: (a: AccountOption) => boolean;
  placeholder?: string;
}) {
  const { data } = useAccounts();
  const list = (data ?? []).filter((a) => a.isActive && (!filter || filter(a)));
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="">{placeholder}</option>
      {list.map((a) => (
        <option key={a.code} value={a.code}>
          {a.code} — {a.name}
        </option>
      ))}
    </select>
  );
}

/** دکمه‌ی اقدام با تأیید، نمایش خطا و بارگذاری */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const run = async (fn: () => Promise<{ data?: { message?: string } } | unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = (await fn()) as { data?: { message?: string } } | undefined;
      setSuccess(res?.data?.message ?? "انجام شد");
      return true;
    } catch (e) {
      setError(getErrorMessage(e, "خطا در انجام عملیات"));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, success, run, setError, setSuccess };
}

export function ActionButton({
  onClick,
  busy,
  children,
  variant = "primary",
  disabled,
}: {
  onClick: () => void;
  busy?: boolean;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  if (variant === "primary") {
    return (
      <button type="button" onClick={onClick} disabled={busy || disabled} className={primaryBtn} style={primaryBtnStyle}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className={
        variant === "danger"
          ? "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-red-100 bg-white text-red-600 disabled:opacity-50"
          : secondaryBtn
      }
    >
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
}

export const api = axios;

/** جدول ساده با کلاس admin-table پروژه */
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full admin-table text-[12px]">{children}</table>
    </div>
  );
}

export function Num({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <td dir="ltr" className={`text-left whitespace-nowrap ${bold ? "font-black" : ""}`}>
      {children}
    </td>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={`px-3.5 py-2 rounded-xl text-[12px] font-bold border ${
            value === t.key ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600"
          }`}
          style={value === t.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
