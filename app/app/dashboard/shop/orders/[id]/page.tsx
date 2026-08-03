"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronRight,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  CreditCard,
  Loader2,
  AlertCircle,
  MapPin,
  Copy,
  ShoppingBag,
} from "lucide-react";
import {
  useShopOrder,
  useCancelShopOrder,
  usePayShopOrder,
} from "@/app/hooks/useShop";
import { useWallet } from "@/app/hooks/useWallet";

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const STATUS_META: Record<
  string,
  { label: string; bg: string; color: string; icon: React.ElementType }
> = {
  PENDING_PAYMENT: {
    label: "در انتظار پرداخت",
    bg: "#fef3c7",
    color: "#b45309",
    icon: Clock,
  },
  PAID: {
    label: "پرداخت شده",
    bg: "#dbeafe",
    color: "#2563eb",
    icon: CheckCircle2,
  },
  PROCESSING: {
    label: "در حال پردازش",
    bg: "#ede9fe",
    color: "#7c3aed",
    icon: Package,
  },
  SHIPPED: {
    label: "ارسال شده",
    bg: "#e0f2fe",
    color: "#0284c7",
    icon: Truck,
  },
  DELIVERED: {
    label: "تحویل داده شده",
    bg: "#dcfce7",
    color: "#16a34a",
    icon: CheckCircle2,
  },
  CANCELLED: {
    label: "لغو شده",
    bg: "#fee2e2",
    color: "#dc2626",
    icon: XCircle,
  },
};

const TIMELINE_STEPS = [
  { key: "PENDING_PAYMENT", label: "ثبت سفارش", icon: ShoppingBag },
  { key: "PAID", label: "پرداخت", icon: CreditCard },
  { key: "PROCESSING", label: "آماده‌سازی", icon: Package },
  { key: "SHIPPED", label: "ارسال", icon: Truck },
  { key: "DELIVERED", label: "تحویل نهایی", icon: CheckCircle2 },
];

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING_PAYMENT;
  const Icon = meta.icon;
  return (
    <span
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <Icon className="w-4 h-4" />
      {meta.label}
    </span>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors active:scale-95"
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}

export default function ShopOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { order, loading, error, refresh } = useShopOrder(params.id);
  const { wallet, refresh: refreshWallet } = useWallet();
  const {
    loading: cancelLoading,
    cancel,
  } = useCancelShopOrder();
  const {
    loading: payLoading,
    error: payError,
    pay,
  } = usePayShopOrder();

  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="max-w-lg mx-auto text-center py-16" dir="rtl">
        <p className="text-[14px] font-bold text-gray-400 mb-4">
          سفارش یافت نشد
        </p>
        <Link
          href="/dashboard/shop/orders"
          className="text-[13px] font-bold"
          style={{ color: "var(--color-emerald)" }}
        >
          بازگشت به سفارش‌ها
        </Link>
      </div>
    );
  }

  const isCancelled = order.status === "CANCELLED";
  const isPendingPayment = order.status === "PENDING_PAYMENT";
  const currentStepIndex = TIMELINE_STEPS.findIndex(
    (s) => s.key === order.status,
  );

  const handleCancel = async () => {
    if (!confirm("آیا از لغو این سفارش مطمئن هستید؟")) return;
    setActionError(null);
    const res = await cancel(order.id);
    if (res) {
      refresh();
    } else {
      setActionError("خطا در لغو سفارش");
    }
  };

  const handleRepay = async () => {
    setActionError(null);
    const res = await pay(order.id);
    if (res) {
      refresh();
      refreshWallet();
    }
  };

  const insufficientBalance =
    isPendingPayment &&
    wallet &&
    wallet.availableRial / 10 < Number(order.totalToman);

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/shop/orders"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">
            جزئیات سفارش
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr">
            {order.id.slice(0, 8)}…
          </p>
        </div>
      </div>

      {(actionError || payError) && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {actionError || payError}
        </div>
      )}

      {/* وضعیت + تایم‌لاین */}
      <div
        className="rounded-2xl p-5 mb-4 space-y-5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center justify-between">
          <StatusBadge status={order.status} />
          <span className="text-[12px] text-gray-400">
            {formatDate(order.createdAt)}
          </span>
        </div>

        {!isCancelled ? (
          <div className="flex items-start justify-between px-1">
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
                        backgroundColor: done
                          ? "var(--color-emerald)"
                          : "#e5e7eb",
                      }}
                    />
                  )}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center border-2 bg-white shrink-0"
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
            این سفارش لغو شده است
          </div>
        )}

        {order.trackingCode && (
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-gray-50">
            <span className="text-[12px] text-gray-500 font-medium">
              کد رهگیری مرسوله
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] font-black text-gray-800" dir="ltr">
                {order.trackingCode}
              </span>
              <CopyBtn text={order.trackingCode} />
            </div>
          </div>
        )}
      </div>

      {/* آدرس تحویل */}
      {order.address && (
        <div
          className="rounded-2xl p-5 mb-4 space-y-2"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2">
            <MapPin
              className="w-4 h-4"
              style={{ color: "var(--color-emerald)" }}
            />
            <h2 className="text-[13px] font-black text-gray-800">
              آدرس تحویل
            </h2>
          </div>
          <p className="text-[12px] font-bold text-gray-700">
            {order.address.title || "آدرس"}
          </p>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            {[order.address.province, order.address.city, order.address.fullAddress]
              .filter(Boolean)
              .join("، ")}
          </p>
        </div>
      )}

      {/* اقلام سفارش */}
      <div
        className="rounded-2xl overflow-hidden mb-4"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="px-4 py-3"
          style={{ backgroundColor: "var(--color-bg-page)" }}
        >
          <h2 className="text-[13px] font-black text-gray-700">
            اقلام سفارش
          </h2>
        </div>
        {order.items.map((item, i) => (
          <div
            key={item.id}
            className={`flex items-center justify-between px-4 py-3.5 ${
              i > 0 ? "border-t" : ""
            }`}
            style={{ borderColor: "var(--color-border)" }}
          >
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-gray-800 truncate">
                {item.productName}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {item.weightGrams} گرم × {item.quantity.toLocaleString("fa-IR")}
              </p>
            </div>
            <span className="text-[12px] font-black text-gray-800 shrink-0">
              {fmtToman(item.lineTotalToman)} ت
            </span>
          </div>
        ))}
        <div
          className="flex items-center justify-between px-4 py-3.5 border-t bg-gray-50"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span className="text-[13px] font-bold text-gray-700">
            مبلغ کل سفارش
          </span>
          <span className="text-[17px] font-black text-gray-900">
            {fmtToman(order.totalToman)} تومان
          </span>
        </div>
      </div>

      {/* اکشن‌ها برای سفارش در انتظار پرداخت */}
      {isPendingPayment && (
        <div className="space-y-3">
          {insufficientBalance && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-[12px] font-bold">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              موجودی کیف پول کافی نیست. موجودی فعلی:{" "}
              {wallet ? fmtToman(wallet.availableRial / 10) : "..."} تومان
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              disabled={cancelLoading || payLoading}
              className="flex-1 py-3.5 rounded-xl font-bold text-[13px] text-red-600 border-2 border-red-100 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {cancelLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "لغو سفارش"
              )}
            </button>
            <button
              onClick={handleRepay}
              disabled={payLoading || cancelLoading || !!insufficientBalance}
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {payLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <CreditCard className="w-4 h-4" />
                  پرداخت از کیف پول
                </>
              )}
            </button>
          </div>
          {insufficientBalance && (
            <Link
              href="/dashboard/wallet/deposit"
              className="block text-center py-3 rounded-xl text-[12px] font-bold"
              style={{
                backgroundColor: "var(--color-emerald-light)",
                color: "var(--color-emerald)",
              }}
            >
              + افزایش موجودی کیف پول
            </Link>
          )}
        </div>
      )}

      {order.status === "DELIVERED" && (
        <button
          onClick={() => router.push("/dashboard/shop")}
          className="w-full py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          خرید مجدد از فروشگاه
        </button>
      )}
    </div>
  );
}