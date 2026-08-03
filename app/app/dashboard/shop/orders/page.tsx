"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ChevronLeft,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  Loader2,
  AlertCircle,
  Inbox,
  ShoppingBag,
} from "lucide-react";
import {
  useShopOrders,
  ShopOrderStatusFilter,
  ShopOrderDto,
} from "@/app/hooks/useShop";

// ── نگاشت وضعیت سفارش به رنگ/آیکون/برچسب ──
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

const FILTERS: { key: ShopOrderStatusFilter; label: string }[] = [
  { key: "ALL", label: "همه" },
  { key: "PENDING_PAYMENT", label: "در انتظار پرداخت" },
  { key: "PROCESSING", label: "در حال پردازش" },
  { key: "SHIPPED", label: "ارسال شده" },
  { key: "DELIVERED", label: "تحویل شده" },
  { key: "CANCELLED", label: "لغو شده" },
];

function fmtToman(v: string | number) {
  return Math.round(Number(v)).toLocaleString("fa-IR");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
    time: d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.PENDING_PAYMENT;
  const Icon = meta.icon;
  return (
    <span
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <Icon className="w-3.5 h-3.5" />
      {meta.label}
    </span>
  );
}

function OrderCard({ order }: { order: ShopOrderDto }) {
  const { date, time } = formatDate(order.createdAt);
  const itemsCount = order.items.reduce((s, i) => s + i.quantity, 0);
  const firstItemName = order.items[0]?.productName ?? "—";
  const extraCount = order.items.length - 1;

  return (
    <Link
      href={`/dashboard/shop/orders/${order.id}`}
      className="flex items-center gap-3 px-4 py-4 transition-colors hover:bg-gray-50 active:bg-gray-100"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "var(--color-emerald-light)" }}
      >
        <ShoppingBag
          className="w-5 h-5"
          style={{ color: "var(--color-emerald)" }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="text-[13px] font-bold text-gray-800 truncate">
            {firstItemName}
            {extraCount > 0 && (
              <span className="text-gray-400 font-medium">
                {" "}
                و {extraCount.toLocaleString("fa-IR")} کالای دیگر
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={order.status} />
          <span className="text-[11px] text-gray-400">
            {itemsCount.toLocaleString("fa-IR")} قلم · {date} · {time}
          </span>
        </div>
        {order.trackingCode && (
          <p className="text-[10px] text-gray-400 mt-1" dir="ltr">
            کد رهگیری: {order.trackingCode}
          </p>
        )}
      </div>

      <div className="text-left shrink-0">
        <p className="text-[13px] font-black text-gray-800">
          {fmtToman(order.totalToman)}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">تومان</p>
      </div>
    </Link>
  );
}

export default function ShopOrdersPage() {
  const [filter, setFilter] = useState<ShopOrderStatusFilter>("ALL");
  const [page, setPage] = useState(1);

  const { orders, total, totalPages, loading, error } = useShopOrders(
    page,
    filter,
  );

  const handleFilterChange = (f: ShopOrderStatusFilter) => {
    setFilter(f);
    setPage(1);
  };

  return (
    <div className="max-w-2xl mx-auto pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/shop"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">
            سفارش‌های من
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {total > 0
              ? `${total.toLocaleString("fa-IR")} سفارش`
              : "تاریخچه خرید از فروشگاه"}
          </p>
        </div>
      </div>

      {/* تب‌های فیلتر */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-hide">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            className={`shrink-0 px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
              filter === f.key
                ? "text-white shadow-sm"
                : "text-gray-500 bg-gray-50 hover:bg-gray-100"
            }`}
            style={
              filter === f.key
                ? { backgroundColor: "var(--color-emerald)" }
                : undefined
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* خطا */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          خطا در دریافت سفارش‌ها
        </div>
      )}

      {/* لیست سفارش‌ها */}
      <div
        className="rounded-2xl overflow-hidden divide-y"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderColor: "var(--color-border)",
        }}
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Inbox className="w-10 h-10 text-gray-300" />
            <p className="text-[13px] font-bold text-gray-400">
              سفارشی یافت نشد
            </p>
            <Link
              href="/dashboard/shop"
              className="mt-2 px-5 py-2.5 rounded-xl text-[12px] font-bold text-white"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              مشاهده فروشگاه
            </Link>
          </div>
        ) : (
          orders.map((order) => <OrderCard key={order.id} order={order} />)
        )}
      </div>

      {/* صفحه‌بندی */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-[12px] font-bold text-gray-500 px-2">
            صفحه {page.toLocaleString("fa-IR")} از{" "}
            {totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}