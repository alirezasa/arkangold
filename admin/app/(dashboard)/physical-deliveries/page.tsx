// admin/app/(dashboard)/physical-deliveries/page.tsx
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import {
  Loader2,
  Package,
  AlertCircle,
  X,
  Truck,
  MapPin,
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

interface DeliveryAddress {
  fullAddress: string;
  province?: string | null;
  city?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
}

interface PhysicalDeliveryItem {
  id: string;
  amountGrams: string;
  feeToman: string;
  status: "PENDING" | "APPROVED" | "SHIPPED" | "DELIVERED" | "CANCELLED";
  trackingCode: string | null;
  adminNotes: string | null;
  address: DeliveryAddress | null;
  user: { id: string; phone: string };
  createdAt: string;
}

interface DeliveriesResponse {
  data: PhysicalDeliveryItem[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  PENDING: { label: "در انتظار بررسی", bg: "#fef3c7", color: "#b45309" },
  APPROVED: { label: "تایید شده", bg: "#dbeafe", color: "#2563eb" },
  SHIPPED: { label: "ارسال شده", bg: "#e0e7ff", color: "#4f46e5" },
  DELIVERED: { label: "تحویل شده", bg: "#dcfce7", color: "#16a34a" },
  CANCELLED: { label: "لغو شده", bg: "#fee2e2", color: "#dc2626" },
};

const FILTERS = [
  { key: "", label: "همه" },
  { key: "PENDING", label: "در انتظار بررسی" },
  { key: "APPROVED", label: "تایید شده" },
  { key: "SHIPPED", label: "ارسال شده" },
  { key: "DELIVERED", label: "تحویل شده" },
  { key: "CANCELLED", label: "لغو شده" },
];

function ShipModal({
  request,
  onClose,
  onDone,
}: {
  request: PhysicalDeliveryItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [trackingCode, setTrackingCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!trackingCode.trim()) return setError("کد پیگیری را وارد کنید");
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/admin/physical-deliveries/${request.id}/ship`, {
        trackingCode: trackingCode.trim(),
      });
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در ثبت ارسال"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">ثبت ارسال طلا</h2>
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
        <input
          placeholder="کد پیگیری (الزامی)"
          value={trackingCode}
          onChange={(e) => setTrackingCode(e.target.value)}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          dir="ltr"
        />
        <button
          onClick={submit}
          disabled={loading}
          className="w-full py-3 rounded-xl font-black text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "ثبت ارسال"}
        </button>
      </div>
    </div>
  );
}

function CancelModal({
  request,
  onClose,
  onDone,
}: {
  request: PhysicalDeliveryItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`/api/admin/physical-deliveries/${request.id}/cancel`, {
        reason: reason.trim() || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "خطا در لغو درخواست"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-black text-gray-900 text-[15px]">لغو درخواست تحویل</h2>
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
        <textarea
          placeholder="دلیل لغو (اختیاری)"
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
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "لغو درخواست"}
        </button>
      </div>
    </div>
  );
}

export default function PhysicalDeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [shipTarget, setShipTarget] = useState<PhysicalDeliveryItem | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PhysicalDeliveryItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (statusFilter) qs.set("status", statusFilter);

  const { data, isLoading, mutate } = useSWR<DeliveriesResponse>(
    `/api/admin/physical-deliveries?${qs.toString()}`,
    fetcher,
  );

  const handleApprove = async (id: string) => {
    if (
      !confirm(
        "آیا از تایید این درخواست مطمئنید؟ این عملیات موجودی طلای کاربر را کسر می‌کند.",
      )
    )
      return;
    setActionError(null);
    setProcessingId(id);
    try {
      await axios.post(`/api/admin/physical-deliveries/${id}/approve`);
      mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در تایید درخواست"));
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeliver = async (id: string) => {
    if (!confirm("آیا از تحویل این طلا به مشتری مطمئنید؟")) return;
    setActionError(null);
    setProcessingId(id);
    try {
      await axios.post(`/api/admin/physical-deliveries/${id}/deliver`);
      mutate();
    } catch (err) {
      setActionError(getErrorMessage(err, "خطا در ثبت تحویل"));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">تحویل فیزیکی طلا</h1>
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

      <div className="space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : !data?.data?.length ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Package className="w-8 h-8 text-gray-200" />
            <p className="text-[12px] text-gray-400">درخواستی یافت نشد</p>
          </div>
        ) : (
          data.data.map((req) => {
            const meta = STATUS_META[req.status] ?? STATUS_META.PENDING;
            return (
              <div
                key={req.id}
                className="rounded-2xl p-4"
                style={{
                  backgroundColor: "var(--color-surface)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span dir="ltr" className="text-[13px] font-bold text-gray-800">
                      {req.user.phone}
                    </span>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {new Date(req.createdAt).toLocaleDateString("fa-IR")}
                    </p>
                  </div>
                  <span
                    className="badge"
                    style={{ background: meta.bg, color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>

                <p className="text-[18px] font-black text-gray-900 mb-1">
                  {Number(req.amountGrams).toLocaleString("fa-IR")} گرم
                </p>
                <p className="text-[12px] text-gray-500 mb-2">
                  کارمزد: {Number(req.feeToman).toLocaleString("fa-IR")} تومان
                </p>

                {req.address && (
                  <div className="flex items-start gap-1.5 text-[12px] text-gray-500 mb-2">
                    <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      {req.address.province} {req.address.city} —{" "}
                      {req.address.fullAddress}
                    </span>
                  </div>
                )}

                {req.trackingCode && (
                  <div className="flex items-center gap-1.5 text-[12px] text-gray-500 mb-2">
                    <Truck className="w-3.5 h-3.5" />
                    کد پیگیری: <span dir="ltr">{req.trackingCode}</span>
                  </div>
                )}

                {req.adminNotes && (
                  <p className="text-[11px] text-gray-400 mb-3">{req.adminNotes}</p>
                )}

                <div className="flex gap-2 flex-wrap">
                  {req.status === "PENDING" && (
                    <button
                      onClick={() => handleApprove(req.id)}
                      disabled={processingId === req.id}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      {processingId === req.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "تایید درخواست"
                      )}
                    </button>
                  )}
                  {req.status === "APPROVED" && (
                    <button
                      onClick={() => setShipTarget(req)}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      ثبت ارسال
                    </button>
                  )}
                  {req.status === "SHIPPED" && (
                    <button
                      onClick={() => handleDeliver(req.id)}
                      disabled={processingId === req.id}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold text-white disabled:opacity-60"
                      style={{ backgroundColor: "var(--color-emerald)" }}
                    >
                      {processingId === req.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        "ثبت تحویل"
                      )}
                    </button>
                  )}
                  {(req.status === "PENDING" || req.status === "APPROVED") && (
                    <button
                      onClick={() => setCancelTarget(req)}
                      className="px-4 py-2 rounded-xl text-[12px] font-bold border-2 border-red-100 text-red-600"
                    >
                      لغو
                    </button>
                  )}
                </div>
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

      {shipTarget && (
        <ShipModal
          request={shipTarget}
          onClose={() => setShipTarget(null)}
          onDone={() => mutate()}
        />
      )}
      {cancelTarget && (
        <CancelModal
          request={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onDone={() => mutate()}
        />
      )}
    </div>
  );
}
