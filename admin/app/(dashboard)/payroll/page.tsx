// admin/app/(dashboard)/payroll/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  Wallet,
  AlertCircle,
  X,
  Plus,
  Play,
  Trash2,
  Search,
} from "lucide-react";

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

interface PlanUser {
  userId: string;
  user: { id: string; phone: string };
}

interface PayrollLog {
  id: string;
  executionDate: string;
  status: "SUCCESS" | "FAILED" | "PARTIAL";
  totalUsers: number;
  successful: number;
  failed: number;
  startedAt: string;
  finishedAt: string | null;
}

interface PayrollPlan {
  id: string;
  name: string;
  amountGrams: string;
  executionDay: number;
  isActive: boolean;
  users: PlanUser[];
  logs?: PayrollLog[];
  createdAt: string;
}

interface UserSearchItem {
  id: string;
  phone: string;
}

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  SUCCESS: { label: "موفق", bg: "#dcfce7", color: "#16a34a" },
  FAILED: { label: "ناموفق", bg: "#fee2e2", color: "#dc2626" },
  PARTIAL: { label: "بخشی موفق", bg: "#fef3c7", color: "#b45309" },
};

function UserPicker({
  selected,
  onAdd,
  onRemove,
}: {
  selected: UserSearchItem[];
  onAdd: (u: UserSearchItem) => void;
  onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const { data } = useSWR(
    q.trim().length >= 3
      ? `/api/admin/users?search=${encodeURIComponent(q.trim())}&limit=8`
      : null,
    fetcher,
  );
  const results: UserSearchItem[] = data?.data ?? [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="جستجو با شماره موبایل (حداقل ۳ رقم)"
          className="w-full px-3 py-2.5 pr-9 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          dir="ltr"
        />
      </div>
      {results.length > 0 && (
        <div className="rounded-xl border border-gray-100 divide-y max-h-40 overflow-y-auto">
          {results.map((u) => {
            const already = selected.some((s) => s.id === u.id);
            return (
              <button
                type="button"
                key={u.id}
                disabled={already}
                onClick={() => {
                  onAdd(u);
                  setQ("");
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-bold disabled:opacity-40"
              >
                <span dir="ltr">{u.phone}</span>
                {already ? (
                  <span className="text-[11px] text-gray-400">افزوده شده</span>
                ) : (
                  <Plus className="w-4 h-4 text-emerald-600" />
                )}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {selected.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold"
              style={{ backgroundColor: "#f3f4f6", color: "#374151" }}
            >
              <span dir="ltr">{u.phone}</span>
              <button type="button" onClick={() => onRemove(u.id)}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CreatePlanModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [amountGrams, setAmountGrams] = useState("");
  const [executionDay, setExecutionDay] = useState("1");
  const [users, setUsers] = useState<UserSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setError("نام پلن را وارد کنید");
    const grams = Number(amountGrams);
    if (!grams || grams <= 0) return setError("مقدار گرم معتبر وارد کنید");
    if (users.length === 0) return setError("حداقل یک کاربر انتخاب کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/admin/payroll/plans", {
        name: name.trim(),
        amountGrams: grams,
        executionDay: Number(executionDay) || 1,
        userIds: users.map((u) => u.id),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ایجاد پلن"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-md rounded-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">ایجاد پلن پی‌رول جدید</h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">
            نام پلن
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثلا: شارژ ماهانه آقای فلانی"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">
            مقدار طلا (گرم)
          </label>
          <input
            type="number"
            value={amountGrams}
            onChange={(e) => setAmountGrams(e.target.value)}
            placeholder="مثلا: 1.5"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">
            روز اجرا در ماه (فقط جهت یادآوری؛ اجرا صرفاً دستی است)
          </label>
          <input
            type="number"
            min={1}
            max={28}
            value={executionDay}
            onChange={(e) => setExecutionDay(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
            dir="ltr"
          />
        </div>
        <div>
          <label className="text-[12px] font-bold text-gray-500 mb-1 block">
            کاربران دریافت‌کننده
          </label>
          <UserPicker
            selected={users}
            onAdd={(u) => setUsers((prev) => [...prev, u])}
            onRemove={(id) => setUsers((prev) => prev.filter((u) => u.id !== id))}
          />
        </div>
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ایجاد پلن"}
        </button>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  onChanged,
}: {
  plan: PayrollPlan;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newUsers, setNewUsers] = useState<UserSearchItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const execute = async () => {
    if (
      !confirm(
        `آیا از اجرای پرداخت این پلن برای ${plan.users.length} کاربر مطمئنید؟ هر کاربر ${plan.amountGrams} گرم طلا دریافت می‌کند.`,
      )
    )
      return;
    setExecuting(true);
    setError(null);
    try {
      await axios.post(`/api/admin/payroll/plans/${plan.id}/execute`);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در اجرای پی‌رول"));
    } finally {
      setExecuting(false);
    }
  };

  const toggleActive = async () => {
    setError(null);
    try {
      await axios.patch(`/api/admin/payroll/plans/${plan.id}`, {
        isActive: !plan.isActive,
      });
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در تغییر وضعیت"));
    }
  };

  const removeUser = async (userId: string) => {
    if (!confirm("این کاربر از پلن حذف شود؟")) return;
    setError(null);
    try {
      await axios.delete(`/api/admin/payroll/plans/${plan.id}/users/${userId}`);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در حذف کاربر"));
    }
  };

  const addUsers = async () => {
    if (newUsers.length === 0) return;
    setError(null);
    try {
      await axios.post(`/api/admin/payroll/plans/${plan.id}/users`, {
        userIds: newUsers.map((u) => u.id),
      });
      setNewUsers([]);
      setAddOpen(false);
      onChanged();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در افزودن کاربر"));
    }
  };

  const lastLog = plan.logs?.[0];

  return (
    <div
      className="rounded-2xl p-4"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[14px] font-black text-gray-900">{plan.name}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {plan.users.length} کاربر · هر کاربر {Number(plan.amountGrams).toLocaleString("fa-IR")} گرم
          </p>
        </div>
        <span
          className="badge"
          style={
            plan.isActive
              ? { background: "#dcfce7", color: "#16a34a" }
              : { background: "#f3f4f6", color: "#6b7280" }
          }
        >
          {plan.isActive ? "فعال" : "غیرفعال"}
        </span>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[12px] font-bold mb-2">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {lastLog && (
        <div className="flex items-center gap-2 mb-3 text-[12px]">
          <span className="text-gray-400">آخرین اجرا:</span>
          <span
            className="badge"
            style={{
              background: STATUS_META[lastLog.status]?.bg,
              color: STATUS_META[lastLog.status]?.color,
            }}
          >
            {STATUS_META[lastLog.status]?.label}
          </span>
          <span className="text-gray-400">
            {new Date(lastLog.executionDate).toLocaleDateString("fa-IR")}
          </span>
          <span className="text-gray-400">
            ({lastLog.successful}/{lastLog.totalUsers} موفق)
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <button
          onClick={execute}
          disabled={executing || !plan.isActive || plan.users.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {executing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          اجرای دستی پرداخت
        </button>
        <button
          onClick={toggleActive}
          className="px-3 py-2 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-600"
        >
          {plan.isActive ? "غیرفعال‌سازی" : "فعال‌سازی"}
        </button>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="px-3 py-2 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-600"
        >
          {expanded ? "بستن جزئیات" : "کاربران و جزئیات"}
        </button>
      </div>

      {expanded && (
        <div className="pt-3 border-t border-gray-100 space-y-3">
          <div className="space-y-1.5">
            {plan.users.map((pu) => (
              <div
                key={pu.userId}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 text-[12px] font-bold"
              >
                <span dir="ltr">{pu.user.phone}</span>
                <button onClick={() => removeUser(pu.userId)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))}
            {plan.users.length === 0 && (
              <p className="text-[12px] text-gray-400">کاربری در این پلن نیست</p>
            )}
          </div>

          {addOpen ? (
            <div className="space-y-2">
              <UserPicker
                selected={newUsers}
                onAdd={(u) => setNewUsers((prev) => [...prev, u])}
                onRemove={(id) => setNewUsers((prev) => prev.filter((u) => u.id !== id))}
              />
              <div className="flex gap-2">
                <button
                  onClick={addUsers}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold text-white"
                  style={{ backgroundColor: "var(--color-emerald)" }}
                >
                  افزودن
                </button>
                <button
                  onClick={() => {
                    setAddOpen(false);
                    setNewUsers([]);
                  }}
                  className="flex-1 py-2 rounded-xl text-[12px] font-bold border border-gray-200 text-gray-600"
                >
                  انصراف
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-700"
            >
              <Plus className="w-4 h-4" />
              افزودن کاربر جدید
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PayrollPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading, mutate } = useSWR<PayrollPlan[]>(
    "/api/admin/payroll/plans",
    fetcher,
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-black text-gray-900">پی‌رول (شارژ دستی کیف‌پول)</h1>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Plus className="w-4 h-4" />
          پلن جدید
        </button>
      </div>
      <p className="text-[12px] text-gray-400 mb-5">
        هر پلن، لیستی از کاربران و مقدار طلای ثابت برای هرکدام است. اجرای پرداخت
        همیشه با کلیک دستی ادمین انجام می‌شود و هیچ زمان‌بندی خودکاری وجود ندارد.
      </p>

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : !data?.length ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Wallet className="w-8 h-8 text-gray-200" />
            <p className="text-[12px] text-gray-400">هنوز پلنی ایجاد نشده است</p>
          </div>
        ) : (
          data.map((plan) => (
            <PlanCard key={plan.id} plan={plan} onChanged={() => mutate()} />
          ))
        )}
      </div>

      {createOpen && (
        <CreatePlanModal
          onClose={() => setCreateOpen(false)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}
