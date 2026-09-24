// admin/app/(dashboard)/discount-codes/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import {
  TicketPercent,
  Loader2,
  Search,
  Plus,
  X,
  AlertCircle,
  CheckCircle2,
  Wand2,
  Copy,
  Pencil,
  Trash2,
  Power,
  BarChart3,
  Users,
  User,
  Wallet,
  ShoppingBag,
  FileText,
} from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import UserPicker, { type UserSearchItem } from "@/app/components/UserPicker";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (data?.message)
      return Array.isArray(data.message) ? data.message[0] : data.message;
  }
  return fallback;
}

type DiscountType = "PERCENT" | "FIXED";
type CodeStatus = "ACTIVE" | "INACTIVE" | "EXPIRED" | "SCHEDULED" | "EXHAUSTED";
type StatusFilter = "" | "ACTIVE" | "INACTIVE" | "EXPIRED" | "SCHEDULED";

interface DiscountCodeItem {
  id: string;
  code: string;
  description: string | null;
  type: DiscountType;
  value: string;
  maxDiscountToman: string | null;
  minOrderToman: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  perUserLimit: number | null;
  isActive: boolean;
  userId: string | null;
  valueLabel: string;
  createdAt: string;
  user: { id: string; phone: string } | null;
  createdBy: { id: string; fullName: string } | null;
  usedCount: number;
  paidCount: number;
  totalDiscountToman: string;
  status: CodeStatus;
}

interface ListResponse {
  data: DiscountCodeItem[];
  total: number;
  totalPages: number;
  page: number;
}

interface Stats {
  totalCodes: number;
  activeCodes: number;
  paidOrdersWithDiscount: number;
  totalDiscountToman: string;
  totalNetSalesToman: string;
}

interface UsageItem {
  orderId: string;
  status: string;
  user: { id: string; phone: string };
  subtotalToman: string;
  discountToman: string;
  totalToman: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  createdAt: string;
}

interface UsagesResponse {
  data: UsageItem[];
  total: number;
  totalPages: number;
  page: number;
}

const faNum = (n: number | string) =>
  Number(n).toLocaleString("fa-IR", { maximumFractionDigits: 2 });

const faDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

/** ISO → مقدار ورودی datetime-local به وقت محلی */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const cardStyle = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
};

const inputCls =
  "mt-1.5 w-full bg-white border border-gray-200 rounded-xl py-2.5 px-3 text-[13px] font-bold outline-none focus:border-gold-500 disabled:bg-gray-50";

const STATUS_META: Record<CodeStatus, { label: string; bg: string; color: string }> = {
  ACTIVE: { label: "فعال", bg: "#dcfce7", color: "#16a34a" },
  INACTIVE: { label: "غیرفعال", bg: "#f3f4f6", color: "#6b7280" },
  EXPIRED: { label: "منقضی", bg: "#fee2e2", color: "#dc2626" },
  SCHEDULED: { label: "زمان‌بندی‌شده", bg: "#e0f2fe", color: "#0284c7" },
  EXHAUSTED: { label: "ظرفیت تکمیل", bg: "#fef3c7", color: "#b45309" },
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_PAYMENT: "در انتظار پرداخت",
  PAID: "پرداخت‌شده",
  PROCESSING: "در حال پردازش",
  SHIPPED: "ارسال‌شده",
  DELIVERED: "تحویل‌شده",
  CANCELLED: "لغوشده",
};

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  unit?: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl p-4" style={cardStyle}>
      <div className="flex items-center gap-1.5 mb-1.5" style={{ color }}>
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-bold text-gray-500">{label}</span>
      </div>
      <p className="text-[16px] font-black text-gray-800">
        {value}
        {unit && (
          <span className="text-[10px] font-normal text-gray-400 mr-1">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════
// ── فرم ایجاد / ویرایش کد تخفیف ──
// ══════════════════════════════════════════
function DiscountFormModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: DiscountCodeItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [code, setCode] = useState(initial?.code ?? "");
  const [prefix, setPrefix] = useState("");
  const [type, setType] = useState<DiscountType>(initial?.type ?? "PERCENT");
  const [value, setValue] = useState(
    initial
      ? initial.type === "FIXED"
        ? String(Number(initial.value) / 10)
        : String(Number(initial.value))
      : "",
  );
  const [maxDiscountToman, setMaxDiscountToman] = useState(
    initial?.maxDiscountToman ?? "",
  );
  const [minOrderToman, setMinOrderToman] = useState(
    initial?.minOrderToman ?? "",
  );
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? null));
  const [expiresAt, setExpiresAt] = useState(
    toLocalInput(initial?.expiresAt ?? null),
  );
  const [usageLimit, setUsageLimit] = useState(
    initial?.usageLimit != null ? String(initial.usageLimit) : "",
  );
  const [perUserLimit, setPerUserLimit] = useState(
    initial ? (initial.perUserLimit != null ? String(initial.perUserLimit) : "") : "1",
  );
  const [audience, setAudience] = useState<"ALL" | "USER">(
    initial?.user ? "USER" : "ALL",
  );
  const [selectedUser, setSelectedUser] = useState<UserSearchItem[]>(
    initial?.user ? [initial.user] : [],
  );
  const [notifyUser, setNotifyUser] = useState(true);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const qs = prefix.trim() ? `?prefix=${encodeURIComponent(prefix.trim())}` : "";
      const res = await axios.get(`/api/admin/discount-codes/generate${qs}`);
      setCode(res.data.code);
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تولید کد"));
    } finally {
      setGenerating(false);
    }
  };

  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  const valueNum = Number(value);
  const previewText =
    value && Number.isFinite(valueNum) && valueNum > 0
      ? type === "PERCENT"
        ? `${faNum(valueNum)}٪ از مبلغ سبد${
            maxDiscountToman ? ` تا سقف ${faNum(maxDiscountToman)} تومان` : ""
          }`
        : `${faNum(valueNum)} تومان از مبلغ نهایی`
      : null;

  const save = async () => {
    setError(null);
    if (!Number.isFinite(valueNum) || valueNum <= 0) {
      return setError("مقدار تخفیف را وارد کنید");
    }
    if (type === "PERCENT" && valueNum > 100) {
      return setError("درصد تخفیف نمی‌تواند بیش از ۱۰۰ باشد");
    }
    if (type === "FIXED" && !Number.isInteger(valueNum)) {
      return setError("مبلغ تخفیف باید به تومان کامل باشد");
    }
    if (audience === "USER" && selectedUser.length === 0) {
      return setError("کاربر موردنظر را انتخاب کنید");
    }

    const maxT = type === "PERCENT" ? numOrNull(maxDiscountToman) : null;
    const minT = numOrNull(minOrderToman);
    const payload: Record<string, unknown> = {
      type,
      value: type === "FIXED" ? valueNum * 10 : valueNum,
      maxDiscountRial: maxT != null ? Math.round(maxT) * 10 : null,
      minOrderRial: minT != null ? Math.round(minT) * 10 : null,
      startsAt: startsAt ? new Date(startsAt).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      usageLimit: numOrNull(usageLimit),
      perUserLimit: numOrNull(perUserLimit),
      userId: audience === "USER" ? selectedUser[0]?.id : null,
      description: description.trim() || (isEdit ? null : undefined),
      isActive,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await axios.patch(`/api/admin/discount-codes/${initial!.id}`, {
          ...payload,
          code: code.trim(),
        });
      } else {
        await axios.post("/api/admin/discount-codes", {
          ...payload,
          code: code.trim() || undefined,
          codePrefix: !code.trim() && prefix.trim() ? prefix.trim() : undefined,
          notifyUser: audience === "USER" ? notifyUser : undefined,
        });
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ذخیره کد تخفیف"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-gray-900 flex items-center gap-2">
            <TicketPercent className="w-4 h-4 text-gold-500" />
            {isEdit ? "ویرایش کد تخفیف" : "کد تخفیف جدید"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── کد ── */}
        <div className="rounded-xl p-4 bg-gray-50 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_140px_auto] items-end">
            <label className="block">
              <span className="text-[12px] font-bold text-gray-600">کد تخفیف</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={isEdit ? "" : "خالی = تولید خودکار"}
                maxLength={32}
                className={`${inputCls} font-mono tracking-wide`}
                dir="ltr"
              />
            </label>
            {!isEdit && (
              <label className="block">
                <span className="text-[12px] font-bold text-gray-600">پیشوند (اختیاری)</span>
                <input
                  value={prefix}
                  onChange={(e) =>
                    setPrefix(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())
                  }
                  placeholder="ARKAN"
                  maxLength={10}
                  className={`${inputCls} font-mono`}
                  dir="ltr"
                />
              </label>
            )}
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700 disabled:opacity-60"
            >
              {generating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              تولید خودکار
            </button>
          </div>
          <p className="text-[10px] text-gray-400">
            فرمت: حروف بزرگ انگلیسی و عدد با خط تیره (مثلاً ARKAN-482915). کد
            به‌صورت خودکار به حروف بزرگ تبدیل می‌شود.
          </p>
        </div>

        {/* ── نوع و مقدار ── */}
        <div>
          <span className="text-[12px] font-bold text-gray-600">نوع تخفیف</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {(
              [
                ["PERCENT", "درصدی"],
                ["FIXED", "مبلغ ثابت"],
              ] as [DiscountType, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setType(key)}
                className={`py-2.5 rounded-xl text-[12px] font-bold border-2 ${
                  type === key
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12px] font-bold text-gray-600">
              {type === "PERCENT" ? "درصد تخفیف" : "مبلغ تخفیف (تومان)"}
            </span>
            <input
              type="number"
              min={0}
              max={type === "PERCENT" ? 100 : undefined}
              step={type === "PERCENT" ? 0.5 : 1000}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </label>
          {type === "PERCENT" ? (
            <label className="block">
              <span className="text-[12px] font-bold text-gray-600">
                سقف مبلغ تخفیف (تومان، اختیاری)
              </span>
              <input
                type="number"
                min={0}
                step={1000}
                value={maxDiscountToman}
                onChange={(e) => setMaxDiscountToman(e.target.value)}
                className={inputCls}
                dir="ltr"
              />
            </label>
          ) : (
            <div />
          )}
          <label className="block">
            <span className="text-[12px] font-bold text-gray-600">
              حداقل مبلغ خرید (تومان، اختیاری)
            </span>
            <input
              type="number"
              min={0}
              step={1000}
              value={minOrderToman}
              onChange={(e) => setMinOrderToman(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
          </label>
        </div>
        {previewText && (
          <p className="text-[12px] font-bold text-emerald-700">
            کاهش مبلغ نهایی: {previewText}
          </p>
        )}

        {/* ── زمان اعتبار ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12px] font-bold text-gray-600">شروع اعتبار (اختیاری)</span>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
            {startsAt && (
              <span className="text-[10px] text-gray-400">
                {faDateTime(new Date(startsAt).toISOString())}
              </span>
            )}
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-gray-600">زمان انقضا (اختیاری)</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className={inputCls}
              dir="ltr"
            />
            <span className="text-[10px] text-gray-400">
              {expiresAt
                ? faDateTime(new Date(expiresAt).toISOString())
                : "خالی = بدون انقضا"}
            </span>
          </label>
        </div>

        {/* ── محدودیت استفاده ── */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[12px] font-bold text-gray-600">سقف کل استفاده</span>
            <input
              type="number"
              min={1}
              value={usageLimit}
              onChange={(e) => setUsageLimit(e.target.value)}
              placeholder="نامحدود"
              className={inputCls}
              dir="ltr"
            />
          </label>
          <label className="block">
            <span className="text-[12px] font-bold text-gray-600">سقف استفاده هر کاربر</span>
            <input
              type="number"
              min={1}
              value={perUserLimit}
              onChange={(e) => setPerUserLimit(e.target.value)}
              placeholder="نامحدود"
              className={inputCls}
              dir="ltr"
            />
          </label>
        </div>

        {/* ── مخاطب ── */}
        <div>
          <span className="text-[12px] font-bold text-gray-600">قابل استفاده برای</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAudience("ALL")}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold border-2 ${
                audience === "ALL"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-500"
              }`}
            >
              <Users className="w-4 h-4" /> همه کاربران
            </button>
            <button
              type="button"
              onClick={() => setAudience("USER")}
              className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold border-2 ${
                audience === "USER"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-500"
              }`}
            >
              <User className="w-4 h-4" /> کاربر خاص
            </button>
          </div>
          {audience === "USER" && (
            <div className="mt-3 space-y-2">
              <UserPicker
                selected={selectedUser}
                onAdd={(u) => setSelectedUser([u])}
                onRemove={() => setSelectedUser([])}
              />
              {!isEdit && (
                <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
                  <input
                    type="checkbox"
                    checked={notifyUser}
                    onChange={(e) => setNotifyUser(e.target.checked)}
                  />
                  ارسال پیامک کد تخفیف به کاربر
                </label>
              )}
            </div>
          )}
        </div>

        <label className="block">
          <span className="text-[12px] font-bold text-gray-600">توضیحات (اختیاری)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="مثلاً کمپین نوروز"
            className={inputCls}
          />
        </label>

        <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          کد فعال باشد
        </label>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl text-[13px] font-bold border-2 border-gray-200 text-gray-600"
          >
            انصراف
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-2 py-3 rounded-xl text-[13px] font-black text-white flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {isEdit ? "ذخیره تغییرات" : "ایجاد کد تخفیف"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// ── گزارش استفاده از یک کد ──
// ══════════════════════════════════════════
function UsagesModal({
  item,
  onClose,
}: {
  item: DiscountCodeItem;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<UsagesResponse>(
    `/api/admin/discount-codes/${item.id}/usages?page=${page}&limit=20`,
    fetcher,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-black text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gold-500" />
            گزارش استفاده از کد{" "}
            <span className="font-mono" dir="ltr">
              {item.code}
            </span>
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-[12px] text-gray-500">
          {item.valueLabel} — {faNum(item.paidCount)} سفارش پرداخت‌شده، مجموع
          تخفیف {faNum(item.totalDiscountToman)} تومان
        </p>

        <div className="rounded-xl overflow-x-auto" style={cardStyle}>
          <table className="w-full admin-table">
            <thead>
              <tr>
                <th>کاربر</th>
                <th>جمع اقلام</th>
                <th>تخفیف</th>
                <th>مبلغ پرداختی</th>
                <th>وضعیت سفارش</th>
                <th>تاریخ</th>
                <th>فاکتور</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center py-8">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" />
                  </td>
                </tr>
              ) : !data?.data.length ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-[12px] text-gray-400">
                    هنوز سفارشی با این کد ثبت نشده است
                  </td>
                </tr>
              ) : (
                data.data.map((u) => (
                  <tr key={u.orderId}>
                    <td>
                      <Link
                        href={`/users/${u.user.id}`}
                        className="font-bold hover:underline"
                        style={{ color: "var(--color-emerald)" }}
                        dir="ltr"
                      >
                        {u.user.phone}
                      </Link>
                    </td>
                    <td>{faNum(u.subtotalToman)} ت</td>
                    <td className="font-bold text-emerald-700">
                      {faNum(u.discountToman)} ت
                    </td>
                    <td className="font-bold">{faNum(u.totalToman)} ت</td>
                    <td className="text-[12px]">
                      {ORDER_STATUS_LABEL[u.status] ?? u.status}
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {new Date(u.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                    <td>
                      {u.invoiceId ? (
                        <a
                          href={`/invoices/${u.invoiceId}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[12px] font-bold text-gray-700 hover:underline"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          مشاهده
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
            >
              قبلی
            </button>
            <span className="text-[12px] font-bold text-gray-500">
              صفحه {faNum(page)} از {faNum(data.totalPages)}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
            >
              بعدی
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiscountCodesPage() {
  const { me } = useAdminMe();
  const canManage = me?.permissions.includes("discount.manage") ?? false;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [editing, setEditing] = useState<DiscountCodeItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [usagesOf, setUsagesOf] = useState<DiscountCodeItem | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (search) qs.set("search", search);
  if (status) qs.set("status", status);

  const { data: stats, mutate: mutateStats } = useSWR<Stats>(
    "/api/admin/discount-codes/stats",
    fetcher,
  );
  const {
    data: list,
    isLoading,
    mutate: mutateList,
  } = useSWR<ListResponse>(`/api/admin/discount-codes?${qs.toString()}`, fetcher);

  const refresh = () => Promise.all([mutateList(), mutateStats()]);

  const toggleActive = async (item: DiscountCodeItem) => {
    setBusyId(item.id);
    setActionError(null);
    try {
      await axios.patch(`/api/admin/discount-codes/${item.id}`, {
        isActive: !item.isActive,
      });
      await refresh();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در تغییر وضعیت"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: DiscountCodeItem) => {
    if (!confirm(`کد تخفیف ${item.code} حذف شود؟`)) return;
    setBusyId(item.id);
    setActionError(null);
    try {
      await axios.delete(`/api/admin/discount-codes/${item.id}`);
      await refresh();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در حذف کد"));
    } finally {
      setBusyId(null);
    }
  };

  const copy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-black text-gray-900 mb-1">کدهای تخفیف</h1>
          <p className="text-[12px] text-gray-400">
            تعریف کد تخفیف درصدی یا مبلغ ثابت برای محصولات فروشگاه، برای همه
            کاربران یا یک کاربر خاص
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Plus className="w-4 h-4" />
            کد تخفیف جدید
          </button>
        )}
      </div>

      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatCard
            icon={TicketPercent}
            label="کل کدها"
            value={faNum(stats.totalCodes)}
            color="#2563eb"
          />
          <StatCard
            icon={CheckCircle2}
            label="کدهای فعال"
            value={faNum(stats.activeCodes)}
            color="#16a34a"
          />
          <StatCard
            icon={ShoppingBag}
            label="سفارش‌های پرداخت‌شده با کد"
            value={faNum(stats.paidOrdersWithDiscount)}
            color="#7c3aed"
          />
          <StatCard
            icon={TicketPercent}
            label="مجموع تخفیف اعطاشده"
            value={faNum(stats.totalDiscountToman)}
            unit="تومان"
            color="#c8952e"
          />
          <StatCard
            icon={Wallet}
            label="فروش خالص با کد تخفیف"
            value={faNum(stats.totalNetSalesToman)}
            unit="تومان"
            color="#0f766e"
          />
        </div>
      )}

      {/* فیلترها */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="جستجو با کد، توضیحات یا موبایل کاربر..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (setSearch(searchInput.trim()), setPage(1))
            }
            className="w-full bg-white border border-gray-200 rounded-xl py-3 pr-11 pl-4 text-[13px] font-medium outline-none focus:border-gold-500"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {(
            [
              ["", "همه"],
              ["ACTIVE", "فعال"],
              ["SCHEDULED", "زمان‌بندی‌شده"],
              ["EXPIRED", "منقضی"],
              ["INACTIVE", "غیرفعال"],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key || "all"}
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
              className={`px-3 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap ${
                status === key ? "text-white" : "text-gray-500 bg-gray-50"
              }`}
              style={
                status === key ? { backgroundColor: "var(--color-emerald)" } : undefined
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[12px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {actionError}
        </div>
      )}

      <div className="rounded-2xl overflow-x-auto" style={cardStyle}>
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>کد</th>
              <th>تخفیف</th>
              <th>قابل استفاده برای</th>
              <th>اعتبار</th>
              <th>استفاده</th>
              <th>مجموع تخفیف</th>
              <th>وضعیت</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !list?.data?.length ? (
              <tr>
                <td colSpan={8} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <TicketPercent className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400 font-medium">
                      کد تخفیفی یافت نشد
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              list.data.map((c) => {
                const meta = STATUS_META[c.status];
                return (
                  <tr key={c.id}>
                    <td>
                      <button
                        type="button"
                        onClick={() => copy(c.code)}
                        className="flex items-center gap-1.5 font-mono font-bold text-gray-800"
                        dir="ltr"
                        title="کپی کد"
                      >
                        {c.code}
                        {copied === c.code ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-gray-300" />
                        )}
                      </button>
                      {c.description && (
                        <p className="text-[11px] text-gray-400 mt-0.5">{c.description}</p>
                      )}
                    </td>
                    <td className="text-[12px]">
                      <p className="font-bold text-gray-800">{c.valueLabel}</p>
                      {c.minOrderToman && (
                        <p className="text-[11px] text-gray-400">
                          حداقل خرید {faNum(c.minOrderToman)} ت
                        </p>
                      )}
                    </td>
                    <td className="text-[12px]">
                      {c.user ? (
                        <Link
                          href={`/users/${c.user.id}`}
                          className="font-bold hover:underline"
                          style={{ color: "var(--color-emerald)" }}
                          dir="ltr"
                        >
                          {c.user.phone}
                        </Link>
                      ) : (
                        <span className="text-gray-500">همه کاربران</span>
                      )}
                    </td>
                    <td className="text-[11px] text-gray-500 whitespace-nowrap">
                      {c.startsAt && <p>از {faDateTime(c.startsAt)}</p>}
                      <p>{c.expiresAt ? `تا ${faDateTime(c.expiresAt)}` : "بدون انقضا"}</p>
                    </td>
                    <td className="text-[12px]">
                      <p className="font-bold">
                        {faNum(c.usedCount)}
                        {c.usageLimit != null && ` / ${faNum(c.usageLimit)}`}
                      </p>
                      <p className="text-[11px] text-gray-400">
                        هر کاربر:{" "}
                        {c.perUserLimit != null ? faNum(c.perUserLimit) : "نامحدود"}
                      </p>
                    </td>
                    <td className="text-[12px] font-bold text-emerald-700">
                      {faNum(c.totalDiscountToman)} ت
                    </td>
                    <td>
                      <span className="badge" style={{ background: meta.bg, color: meta.color }}>
                        {meta.label}
                      </span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setUsagesOf(c)}
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                          title="گزارش استفاده"
                        >
                          <BarChart3 className="w-4 h-4" />
                        </button>
                        {canManage && (
                          <>
                            <button
                              onClick={() => setEditing(c)}
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                              title="ویرایش"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => toggleActive(c)}
                              disabled={busyId === c.id}
                              className={`p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 ${
                                c.isActive ? "text-emerald-600" : "text-gray-400"
                              }`}
                              title={c.isActive ? "غیرفعال کردن" : "فعال کردن"}
                            >
                              {busyId === c.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Power className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => remove(c)}
                              disabled={busyId === c.id}
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 disabled:opacity-40"
                              title="حذف (فقط کد استفاده‌نشده)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {list && list.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {faNum(page)} از {faNum(list.totalPages)}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))}
            disabled={page >= list.totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}

      {(creating || editing) && (
        <DiscountFormModal
          key={editing?.id ?? "new"}
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            refresh();
          }}
        />
      )}

      {usagesOf && <UsagesModal item={usagesOf} onClose={() => setUsagesOf(null)} />}
    </div>
  );
}
