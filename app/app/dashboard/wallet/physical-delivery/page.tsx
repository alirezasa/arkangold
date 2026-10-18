"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Package,
  Plus,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Truck,
  ShieldCheck,
  XCircle,
  X,
  Coins,
  Info,
  FileText,
} from "lucide-react";
import axios from "axios";
import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import {
  usePhysicalDeliveryConfig,
  usePhysicalDeliveryRequests,
  useCancelPhysicalDelivery,
  PhysicalDeliveryRequestItem,
} from "@/app/hooks/usePhysicalDelivery";
import { openInvoicePrint } from "@/app/hooks/useInvoices";
import GoldBarRequest, { fmtG, fmtSoot, fmtT, useGoldBars } from "./GoldBarRequest";

interface GoldBarOrderItem {
  id: string;
  orderNumber: string | null;
  status: string;
  productName: string;
  weightGrams: string;
  totalToman: string;
  goldAppliedGrams: string;
  goldAppliedToman: string;
  paidToman: string;
  createdAt: string;
}

const ORDER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING_PAYMENT: { label: "در انتظار پرداخت", color: "#b45309", bg: "#fef3c7" },
  PAID: { label: "پرداخت‌شده — آماده‌سازی", color: "#2563eb", bg: "#dbeafe" },
  PROCESSING: { label: "در حال آماده‌سازی", color: "#2563eb", bg: "#dbeafe" },
  SHIPPED: { label: "ارسال شده", color: "#7c3aed", bg: "#ede9fe" },
  DELIVERED: { label: "تحویل داده شده", color: "#16a34a", bg: "#dcfce7" },
  CANCELLED: { label: "لغو شده", color: "#dc2626", bg: "#fee2e2" },
};

// ── نگاشت وضعیت‌ها ──
const STATUS_META: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ElementType }
> = {
  PENDING: {
    label: "در انتظار بررسی",
    color: "#b45309",
    bg: "#fef3c7",
    icon: Clock,
  },
  APPROVED: {
    label: "تایید شده",
    color: "#2563eb",
    bg: "#dbeafe",
    icon: ShieldCheck,
  },
  SHIPPED: { label: "ارسال شده", color: "#7c3aed", bg: "#ede9fe", icon: Truck },
  DELIVERED: {
    label: "تحویل داده شده",
    color: "#16a34a",
    bg: "#dcfce7",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "لغو شده",
    color: "#dc2626",
    bg: "#fee2e2",
    icon: XCircle,
  },
};

const TIMELINE_STEPS = [
  { key: "PENDING", label: "ثبت درخواست", icon: Clock },
  { key: "APPROVED", label: "تایید کارشناسان", icon: ShieldCheck },
  { key: "SHIPPED", label: "ارسال مرسوله", icon: Truck },
  { key: "DELIVERED", label: "تحویل نهایی", icon: CheckCircle2 },
];

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING;
  const Icon = meta.icon;
  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

function fmtGrams(v: string | number) {
  return Number(v).toLocaleString("fa-IR", { maximumFractionDigits: 4 });
}
function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

// ─────────────────────────────────────────────
// مودال جزئیات + تایم‌لاین وضعیت
// ────────────────────────────────────────────

function DetailModal({
  request,
  onClose,
  onCancelled,
}: {
  request: PhysicalDeliveryRequestItem;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { loading, cancel } = useCancelPhysicalDelivery();
  const { config } = usePhysicalDeliveryConfig();

  const isCancelled = request.status === "CANCELLED";
  const isPending = request.status === "PENDING";
  const currentStepIndex = TIMELINE_STEPS.findIndex(
    (s) => s.key === request.status,
  );

  const estimatedFeeToman = config
    ? Number(request.amountGrams) * Number(config.feePerGramToman)
    : 0;

  const handleCancel = async () => {
    await cancel(request.id);
    onCancelled();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-4"
      dir="rtl"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between gap-2 px-5 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex-1">
            <h3 className="text-[14px] font-black text-gray-900">
              جزئیات درخواست
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr">
              {request.id.slice(0, 8)}…
            </p>
          </div>
          {request.invoiceId && (
            <button
              onClick={() => openInvoicePrint(request.invoiceId!)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              فاکتور
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          <div className="flex items-center justify-between">
            <StatusBadge status={request.status} />
            <span className="text-[16px] font-black text-gray-900">
              {fmtGrams(request.amountGrams)} گرم
            </span>
          </div>

          {!isCancelled ? (
            <div className="flex items-center justify-between px-2">
              {TIMELINE_STEPS.map((step, i) => {
                const Icon = step.icon;
                const done = i <= currentStepIndex;
                return (
                  <div
                    key={step.key}
                    className="flex-1 flex flex-col items-center relative"
                  >
                    {i > 0 && (
                      <div
                        className="absolute top-4 right-1/2 w-full h-0.5 -z-10"
                        style={{
                          backgroundColor:
                            i <= currentStepIndex
                              ? "var(--color-emerald)"
                              : "#e5e7eb",
                        }}
                      />
                    )}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center border-2 bg-white"
                      style={{
                        borderColor: done ? "var(--color-emerald)" : "#e5e7eb",
                        color: done ? "var(--color-emerald)" : "#9ca3af",
                      }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span
                      className="text-[9px] font-bold mt-1.5 text-center leading-tight"
                      style={{
                        color: done ? "var(--color-emerald)" : "#9ca3af",
                      }}
                    >
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[12px] font-bold">
              <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
              این درخواست لغو شده است
              {request.adminNotes && (
                <span className="font-medium block mt-1">
                  {request.adminNotes}
                </span>
              )}
            </div>
          )}

          <div
            className="rounded-xl overflow-hidden border"
            style={{ borderColor: "var(--color-border)" }}
          >
            {[
              {
                label: isPending
                  ? "کارمزد (تخمینی — تا قبل از تایید)"
                  : "کارمزد",
                value: isPending
                  ? `${fmtToman(estimatedFeeToman)} تومان`
                  : `${fmtToman(request.feeToman)} تومان`,
              },
              {
                label: "آدرس",
                value: [
                  request.address?.province,
                  request.address?.city,
                  request.address?.fullAddress,
                ]
                  .filter(Boolean)
                  .join("، "),
                small: true,
              },
              ...(request.trackingCode
                ? [
                    {
                      label: "کد رهگیری مرسوله",
                      value: request.trackingCode,
                      ltr: true,
                    },
                  ]
                : []),
              {
                label: "تاریخ ثبت",
                value: new Date(request.createdAt).toLocaleDateString("fa-IR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                }),
              },
            ].map((row, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-3 px-4 py-3 border-t first:border-t-0 bg-white"
                style={{ borderColor: "var(--color-border)" }}
              >
                <span className="text-[12px] text-gray-500 font-medium shrink-0">
                  {row.label}
                </span>
                <span
                  className={`text-[12px] font-bold text-gray-700 ${row.small ? "text-left leading-relaxed" : ""}`}
                  dir={row.ltr ? "ltr" : undefined}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {isPending && (
            <div className="flex items-start gap-2 px-1 text-[11px] text-gray-400 leading-relaxed">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p>
                مبلغ کارمزد نهایی در لحظه‌ی تایید توسط کارشناسان محاسبه و از کیف
                پول شما کسر خواهد شد؛ عدد بالا صرفاً تخمین است.
              </p>
            </div>
          )}

          {request.status === "PENDING" && (
            <button
              onClick={handleCancel}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-[13px] text-red-600 border-2 border-red-100 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "لغو درخواست"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// صفحه اصلی
// ─────────────────────────────────────────────
export default function PhysicalDeliveryPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedRequest, setSelectedRequest] =
    useState<PhysicalDeliveryRequestItem | null>(null);

  const { data: bars, loading: barsLoading, error: barsError, refresh: refreshBars } = useGoldBars();
  const { data: barOrders, mutate: refreshOrders } = useSWR<GoldBarOrderItem[]>(
    "/api/gold-delivery/orders",
    (url: string) => axios.get(url).then((r) => r.data),
  );
  // درخواست‌های تحویل وزنی قدیمی (فقط برای مشاهده‌ی سابقه)
  const { requests, refresh } = usePhysicalDeliveryRequests();

  // بازگشت از درگاه پرداخت مابه‌التفاوت
  const paymentStatus = useSearchParams().get("paymentStatus");

  const minGold = Number(bars?.minGoldGrams ?? 0.5);
  const available = Number(bars?.goldAvailableGrams ?? 0);
  const progress = minGold > 0 ? Math.min(100, (available / minGold) * 100) : 100;

  return (
    <div className="max-w-lg mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">
            تحویل فیزیکی طلا
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            تبدیل طلای آب‌شده به شمش و دریافت پستی
          </p>
        </div>
      </div>

      {paymentStatus && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-xl p-3 text-[12px] font-bold ${
            paymentStatus === "success"
              ? "bg-green-50 text-green-700 border border-green-100"
              : "bg-red-50 text-red-600 border border-red-100"
          }`}
        >
          {paymentStatus === "success" ? (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          {paymentStatus === "success"
            ? "پرداخت انجام شد و درخواست تحویل فیزیکی شما ثبت شد."
            : "پرداخت ناموفق بود؛ طلای رزروشده به کیف شما برگشت. دوباره تلاش کنید."}
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-2xl p-5 mb-5"
        style={{
          background:
            "linear-gradient(135deg, var(--color-emerald) 0%, #24060a 100%)",
        }}
      >
        <div className="absolute -top-8 -left-8 w-32 h-32 rounded-full opacity-10 blur-2xl bg-gold-500 pointer-events-none" />
        <div className="relative z-10 flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center">
            <Package
              className="w-5 h-5"
              style={{ color: "var(--color-gold-500)" }}
            />
          </div>
          <div className="min-w-0">
            <p className="text-[13px] font-black text-white">
              طلای قابل استفاده: {fmtG(available)} گرم ({fmtSoot(available)} سوت)
            </p>
            <p className="text-[11px] text-white/60 mt-0.5 leading-relaxed">
              تحویل فیزیکی = خرید شمش موجود؛ وزن شمش از کیف طلایی و مابه‌التفاوت
              از کیف ریالی، طلای اضافه یا درگاه پرداخت می‌شود.
            </p>
          </div>
        </div>

        <div className="relative z-10 mb-4">
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, backgroundColor: "var(--color-gold-500)" }}
            />
          </div>
          <p className="mt-1.5 text-[10.5px] text-white/60">
            حداقل لازم: {fmtSoot(minGold)} سوت ({fmtG(minGold)} گرم)
            {bars && !bars.eligible &&
              ` — ${fmtSoot(Math.max(0, minGold - available))} سوت دیگر خرید کنید`}
          </p>
        </div>

        {bars && !bars.eligible ? (
          <Link
            href="/dashboard/trade"
            className="relative z-10 w-full py-3 rounded-xl font-black text-[13px] flex items-center justify-center gap-2"
            style={{
              backgroundColor: "var(--color-gold-500)",
              color: "var(--color-emerald)",
            }}
          >
            <Coins className="w-4 h-4" />
            خرید طلای آب‌شده
          </Link>
        ) : (
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={barsLoading || !!barsError}
            className="relative z-10 w-full py-3 rounded-xl font-black text-[13px] flex items-center justify-center gap-2 disabled:opacity-60"
            style={{
              backgroundColor: "var(--color-gold-500)",
              color: "var(--color-emerald)",
            }}
          >
            {barsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            انتخاب شمش و ثبت درخواست
          </button>
        )}
        {barsError && (
          <p className="relative z-10 mt-2 text-[11px] font-bold text-red-200">{barsError}</p>
        )}
      </div>

      <h2 className="text-[13px] font-black text-gray-700 mb-3">درخواست‌های تحویل (شمش)</h2>
      <div
        className="rounded-2xl overflow-hidden mb-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {!barOrders ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : barOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Package className="w-10 h-10 text-gray-300" />
            <p className="text-[13px] font-bold text-gray-400">هنوز درخواستی ثبت نکرده‌اید</p>
          </div>
        ) : (
          barOrders.map((o, idx) => {
            const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.PENDING_PAYMENT;
            return (
              <Link
                key={o.id}
                href={`/dashboard/shop/orders/${o.id}`}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right transition-colors hover:bg-gray-50"
                style={{ borderTop: idx > 0 ? "1px solid var(--color-border)" : undefined }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--color-emerald-light)" }}
                >
                  <Coins className="w-4 h-4" style={{ color: "var(--color-emerald)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-gray-800 truncate">
                    {o.productName || `شمش ${fmtG(o.weightGrams)} گرمی`}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {fmtG(o.goldAppliedGrams)} گرم از کیف طلایی
                    {Number(o.paidToman) > 0 && ` + ${fmtT(o.paidToman)} تومان`}
                  </p>
                </div>
                <span
                  className="px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0"
                  style={{ backgroundColor: st.bg, color: st.color }}
                >
                  {st.label}
                </span>
              </Link>
            );
          })
        )}
      </div>

      {requests.length > 0 && (
        <>
          <h2 className="text-[13px] font-black text-gray-700 mb-3">درخواست‌های قبلی (تحویل وزنی)</h2>
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            {requests.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => setSelectedRequest(r)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-right transition-colors hover:bg-gray-50"
                style={{
                  borderTop:
                    idx > 0 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: "var(--color-emerald-light)" }}
                >
                  <Coins
                    className="w-4 h-4"
                    style={{ color: "var(--color-emerald)" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-black text-gray-800">
                    {fmtGrams(r.amountGrams)} گرم طلا
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(r.createdAt).toLocaleDateString("fa-IR", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        </>
      )}

      <GoldBarRequest
        open={showCreateModal}
        bars={bars}
        onClose={() => setShowCreateModal(false)}
        onDone={() => {
          void refreshBars();
          void refreshOrders();
        }}
      />

      {selectedRequest && (
        <DetailModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onCancelled={refresh}
        />
      )}
    </div>
  );
}
