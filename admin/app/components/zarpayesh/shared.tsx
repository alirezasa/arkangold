// admin/app/components/zarpayesh/shared.tsx
//
// برچسب‌ها، انواع و اجزای مشترک صفحه‌ی «سامانه ناظر طلا (زر پایش)»
"use client";
import { useState } from "react";
import { Search, X } from "lucide-react";
import useSWR from "swr";
import { fetcher, inputCls } from "@/app/components/finance/ui";

export const API = "/api/admin/zarpayesh";

export const TRADE_STATUS: Record<string, { label: string; cls: string }> = {
  RESERVING: { label: "در حال رزرو", cls: "bg-sky-50 text-sky-700" },
  RESERVED: { label: "رزرو شده", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "تأیید شده", cls: "bg-green-50 text-green-700" },
  CANCELLED: { label: "لغو شده", cls: "bg-gray-100 text-gray-600" },
  FAILED: { label: "ناموفق", cls: "bg-red-50 text-red-600" },
  UNKNOWN: { label: "نامشخص — در پیگیری", cls: "bg-orange-50 text-orange-700" },
};

export const USER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "ثبت‌نشده", cls: "bg-gray-100 text-gray-600" },
  REGISTERED: { label: "ثبت‌شده", cls: "bg-green-50 text-green-700" },
  FAILED: { label: "ناموفق", cls: "bg-red-50 text-red-600" },
};

export const DELIVERY_STATE: Record<string, { label: string; cls: string }> = {
  REQUESTING: { label: "در حال ثبت / نامشخص", cls: "bg-orange-50 text-orange-700" },
  REQUESTED: { label: "ثبت‌شده", cls: "bg-blue-50 text-blue-700" },
  FAILED: { label: "ناموفق", cls: "bg-red-50 text-red-600" },
};

export const DELIVERY_REMOTE: Record<string, { label: string; cls: string }> = {
  "1": { label: "Approve — تحویل کاربر شد", cls: "bg-green-50 text-green-700" },
  "2": { label: "Ship — آماده ارسال", cls: "bg-blue-50 text-blue-700" },
  "3": { label: "Delivery — ارسال شد", cls: "bg-indigo-50 text-indigo-700" },
  "4": { label: "Cancel — لغو شد", cls: "bg-gray-100 text-gray-600" },
};

export const ORDER_TYPE_FA: Record<number, string> = {
  1: "خرید کاربر از پلتفرم",
  2: "فروش کاربر به پلتفرم",
};

export const TXN_STATUS_FA: Record<number, string> = {
  1: "رزرو شده",
  2: "تایید شده",
  3: "ابطال شده",
  4: "منقضی شده",
};

export const PAY_TYPE_FA: Record<number, string> = {
  1: "ATM",
  2: "پایانه فروشگاهی - POS",
  3: "صفحه وب - IPG",
  4: "کارت به کارت",
  5: "پایا",
  6: "ساتنا",
  7: "چک بین بانکی",
  8: "چک رمز دار",
  9: "سامانه پل",
  10: "ریال دیجیتال",
  11: "کیف پول کاربر نزد سکو - wallet",
  12: "هدیه",
};

export const METHODS = [
  "Login",
  "RefreshToken",
  "Logout",
  "Reserve",
  "Approve",
  "Cancel",
  "TxnFollowup",
  "GetUserBalance",
  "MakeDeliveries",
  "MakeDeliverFollowup",
  "SetDeliveries",
  "GetDeliveries",
  "Vaultlist",
  "AddPlatformUsers",
  "EditPlatformUsers",
  "Typelist",
  "cities",
  "states",
  "PayTypelist",
];

export interface ZpConfig {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
  typeId: string | null;
  typeTitle: string | null;
  vaultId: string | null;
  vaultTitle: string | null;
  buyPayType: number;
  sellPayType: number;
  unitPriceBasis: "GRAM" | "MILLIGRAM";
  autoRegisterUsers: boolean;
  connectionVerifiedAt: string | null;
  lastTestAt: string | null;
  lastTestResult: { ok: boolean; steps: TestStep[] } | null;
  enabledAt: string | null;
}

export interface TestStep {
  step: string;
  ok: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
  errorCode?: string | null;
}

export interface Overview {
  config: ZpConfig;
  readiness: { key: string; label: string; ok: boolean }[];
  ready: boolean;
  credentials: { key: string; isSet: boolean; maskedValue: string | null; updatedAt: string | null; rotationDue: boolean }[];
  session: { active: boolean; obtainedAt?: string; expire?: string; refreshExpire?: string; tokenValid?: boolean };
  stats: {
    trades: Record<string, number>;
    needsReview: number;
    calls24h: number;
    failed24h: number;
    users: Record<string, number>;
    verifiedMissingBirthDate: number;
  };
  reference: { errors: Record<string, string> };
}

export const useOverview = () => useSWR<Overview>(`${API}/overview`, fetcher);

/** نمایش JSON خوانا */
export function Json({ value }: { value: unknown }) {
  return (
    <pre
      dir="ltr"
      className="text-[11px] leading-5 bg-gray-50 border border-gray-100 rounded-xl p-3 overflow-x-auto max-h-80 whitespace-pre-wrap break-all"
    >
      {value === undefined ? "—" : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4 sm:p-5 space-y-3 bg-white border border-gray-100">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-black text-gray-900">{title}</h2>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** انتخاب یک کاربر با جستجوی شماره موبایل */
export function SingleUserPicker({
  value,
  onChange,
}: {
  value: { id: string; phone: string } | null;
  onChange: (u: { id: string; phone: string } | null) => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useSWR<{ data: { id: string; phone: string }[] }>(
    q.trim().length >= 3 ? `/api/admin/users?search=${encodeURIComponent(q.trim())}&limit=8` : null,
    fetcher,
  );
  if (value) {
    return (
      <div className="mt-1 flex items-center justify-between px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
        <span dir="ltr" className="text-[13px] font-bold">
          {value.phone}
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="حذف">
          <X className="w-4 h-4 text-gray-400" />
        </button>
      </div>
    );
  }
  return (
    <div className="mt-1 space-y-1">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="شماره موبایل (حداقل ۳ رقم)"
          className={`${inputCls} pr-9`}
          dir="ltr"
        />
      </div>
      {(data?.data ?? []).length > 0 && (
        <div className="rounded-xl border border-gray-100 divide-y max-h-40 overflow-y-auto bg-white">
          {(data?.data ?? []).map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => {
                onChange({ id: u.id, phone: u.phone });
                setQ("");
              }}
              className="w-full text-right px-3 py-2 text-[13px] font-bold hover:bg-gray-50"
            >
              <span dir="ltr">{u.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const mgToGrams = (mg: string | number | null | undefined) =>
  mg == null || mg === "" ? "—" : (Number(mg) / 1000).toLocaleString("fa-IR", { maximumFractionDigits: 3 });
