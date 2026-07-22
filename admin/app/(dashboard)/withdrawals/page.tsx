// admin/app/(dashboard)/withdrawals/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  XCircle,
  AlertCircle,
  X,
  CreditCard,
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

interface WithdrawalItem {
  id: string;
  amountToman: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "PROCESSED";
  adminNotes: string | null;
  user: { id: string; phone: string };
  bankAccount: { bankName: string; cardNumber: string };
  createdAt: string;
}

const STATUS_META: Record<
  string,
  { label: string; bg: string; color: string }
> = {
  PENDING: { label: "در انتظار", bg: "#fef3c7", color: "#b45309" },
  APPROVED: { label: "تایید شده", bg: "#dcfce7", color: "#16a34a" },
  REJECTED: { label: "رد شده", bg: "#fee2e2", color: "#dc2626" },
  PROCESSED: { label: "پردازش شده", bg: "#dbeafe", color: "#2563eb" },
};

function RejectModal({
  item,
  onClose,
  onDone,
}: {
  item: WithdrawalItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reason.trim()) return setError("دلیل رد را وارد کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/admin/withdrawals/${item.id}/reject`, {
        reason: reason.trim(),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در رد درخواست"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">
            رد درخواست برداشت
          </h2>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        <div className="text-[12px] text-gray-500">
          مبلغ:{" "}
          <span className="font-bold text-gray-800">
            {Number(item.amountToman).toLocaleString("fa-IR")} تومان
          </span>
        </div>
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 text-red-600 text-[13px] font-bold">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        <textarea
          placeholder="دلیل رد درخواست (الزامی)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm resize-none"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "#dc2626" }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto" />
          ) : (
            "رد درخواست"
          )}
        </button>
      </div>
    </div>
  );
}

export default function WithdrawalsPage() {
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [rejectTarget, setRejectTarget] = useState<WithdrawalItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (statusFilter) qs.set("status", statusFilter);

  const { data, isLoading, mutate } = useSWR(
    `/api/admin/withdrawals?${qs.toString()}`,
    fetcher,
  );

  const handleApprove = async (id: string) => {
    if (
      !confirm(
        "آیا از تایید این درخواست برداشت مطمئنید؟ این عملیات موجودی کاربر را کسر می‌کند.",
      )
    )
      return;
    setActionError(null);
    setProcessingId(id);
    try {
      await axios.post(`/api/admin/withdrawals/${id}/approve`);
      mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در تایید درخواست"));
    } finally {
      setProcessingId(null);
    }
  };

  const FILTERS = [
    { key: "PENDING", label: "در انتظار" },
    { key: "APPROVED", label: "تایید شده" },
    { key: "REJECTED", label: "رد شده" },
    { key: "", label: "همه" },
  ];

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">
        درخواست‌های برداشت
      </h1>
      <p className="text-[12px] text-gray-400 mb-4">
        {data ? `${data.total.toLocaleString("fa-IR")} درخواست` : "..."}
      </p>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => {
              setStatusFilter(f.key);
              setPage(1);
            }}
            className="shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap"
            style={
              statusFilter === f.key
                ? { backgroundColor: "var(--color-emerald)", color: "#fff" }
                : {
                    backgroundColor: "var(--color-surface)",
                    color: "#6b7280",
                    border: "1px solid var(--color-border)",
                  }
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {actionError}
        </div>
      )}

      {/* ── نسخه دسکتاپ: جدول ── */}
      <div
        className="hidden sm:block rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <table className="w-full admin-table">
          <thead>
            <tr>
              <th>کاربر</th>
              <th>مبلغ</th>
              <th>حساب مقصد</th>
              <th>وضعیت</th>
              <th>تاریخ</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={6} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Wallet className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">
                      درخواستی یافت نشد
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              data.data.map((w: WithdrawalItem) => {
                const meta = STATUS_META[w.status] ?? STATUS_META.PENDING;
                return (
                  <tr key={w.id}>
                    <td dir="ltr" className="text-left">
                      {w.user.phone}
                    </td>
                    <td className="font-black">
                      {Number(w.amountToman).toLocaleString("fa-IR")} ت
                    </td>
                    <td className="text-[12px]">
                      {w.bankAccount.bankName}
                      <span dir="ltr" className="block text-gray-400">
                        {w.bankAccount.cardNumber}
                      </span>
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{ background: meta.bg, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="text-[12px] text-gray-500">
                      {new Date(w.createdAt).toLocaleDateString("fa-IR")}
                    </td>
                    <td>
                      {w.status === "PENDING" ? (
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => handleApprove(w.id)}
                            disabled={processingId === w.id}
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"
                          >
                            {processingId === w.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                          </button>
                          <button
                            onClick={() => setRejectTarget(w)}
                            disabled={processingId === w.id}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── نسخه موبایل: کارت‌ها ── */}
      <div className="sm:hidden space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : !data?.data?.length ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Wallet className="w-8 h-8 text-gray-200" />
            <p className="text-[12px] text-gray-400">درخواستی یافت نشد</p>
          </div>
        ) : (
          data.data.map((w: WithdrawalItem) => {
            const meta = STATUS_META[w.status] ?? STATUS_META.PENDING;
            return (
              <div
                key={w.id}
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span dir="ltr" className="text-[13px] font-bold">
                    {w.user.phone}
                  </span>
                  <span
                    className="badge"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                <p className="text-[18px] font-black text-gray-900 mb-2">
                  {Number(w.amountToman).toLocaleString("fa-IR")} ت
                </p>
                <div className="flex items-center gap-1.5 text-[12px] text-gray-500 mb-3">
                  <CreditCard className="w-3.5 h-3.5" />
                  {w.bankAccount.bankName} —{" "}
                  <span dir="ltr">{w.bankAccount.cardNumber}</span>
                </div>
                {w.status === "PENDING" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRejectTarget(w)}
                      className="flex-1 py-2.5 rounded-xl text-[12px] font-bold border-2 border-red-100 text-red-600"
                    >
                      رد
                    </button>
                    <button
                      onClick={() => handleApprove(w.id)}
                      disabled={processingId === w.id}
                      className="flex-1 py-2.5 rounded-xl text-[12px] font-bold text-white"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      {processingId === w.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : (
                        "تایید"
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {page.toLocaleString("fa-IR")} از{" "}
            {data.totalPages.toLocaleString("fa-IR")}
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

      {rejectTarget && (
        <RejectModal
          item={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}
