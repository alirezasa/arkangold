// admin/app/(dashboard)/shop-orders/page.tsx
//
// سفارشات فروشگاه: فهرست با جستجو و فیلتر، جزئیات کامل، چرخه‌ی پردازش ← ارسال (انتخاب مرجع
// ارسال و صدور کد تحویل) ← تحویل (فقط با کد تحویل مشتری یا تأیید استثنایی با دلیل)، Timeline و پیامک‌ها.
"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Box,
  CheckCircle2,
  Clock,
  FileText,
  KeyRound,
  MapPin,
  MessageSquareText,
  PackageCheck,
  Printer,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";
import JalaliDateInput from "@/app/components/JalaliDateInput";
import {
  ActionButton,
  Alert,
  Badge,
  DateRange,
  Empty,
  Field,
  Modal,
  PageHeader,
  Pagination,
  Spinner,
  api,
  cardStyle,
  faDateTime,
  fetcher,
  inputCls,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

type OrderStatus = "PENDING_PAYMENT" | "PAID" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";

interface OrderItem {
  id: string;
  productName: string;
  quantity: number;
  weightGrams: string;
  unitPriceToman: string;
  lineTotalToman: string;
  packaging: { name: string; quantity: number; chargedToman: string; free: boolean } | null;
}
interface Address {
  fullAddress: string;
  province?: string | null;
  city?: string | null;
  postalCode?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
}
interface OrderRow {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  subtotalToman: string;
  discountToman: string;
  discountCode: string | null;
  packagingToman: string;
  packagingWaivedToman: string;
  totalToman: string;
  trackingCode: string | null;
  invoiceId: string | null;
  address: Address | null;
  items: OrderItem[];
  user: { id: string; phone: string; fullName: string | null };
  shipping: { methodName: string | null; methodType: string | null; trackingCode: string | null; courierName: string | null } | null;
  labelPrintCount: number;
  labelPrintedAt: string | null;
  createdAt: string;
}
interface ListResp {
  data: OrderRow[];
  statusCounts: Record<string, number>;
  total: number;
  totalPages: number;
  page: number;
}
interface ShippingView {
  method: { id: string; name: string; type: string } | null;
  carrierName: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  courierName: string | null;
  courierPhone: string | null;
  deliveryCodeRequired: boolean;
  deliveryCodeAttempts: number;
  deliveryCodeLocked: boolean;
  deliveryCodeSentAt: string | null;
  deliveredAt: string | null;
  deliveryConfirmedVia: string | null;
  receivedByName: string | null;
  note: string | null;
}
interface OrderDetail extends Omit<OrderRow, "shipping"> {
  adminNote: string | null;
  user: { id: string; phone: string; fullName: string | null; nationalCode: string | null };
  payments: { id: string; method: string; status: string; amountToman: string; gatewayProvider: string | null; gatewayTrackingCode: string | null; paidAt: string | null }[];
  delivery: {
    cancelReason: string | null;
    shipping: ShippingView | null;
    timeline: { id: string; toStatus: OrderStatus; toStatusLabel: string; actorType: string; note: string | null; createdAt: string }[];
  } | null;
  smsLogs: { id: string; templateKey: string | null; status: string; providerCode: string | null; errorMessage: string | null; createdAt: string }[];
}
interface ShippingMethod {
  id: string;
  code: string;
  name: string;
  type: "POST" | "COURIER" | "EXPRESS" | "PICKUP";
  requiresTrackingCode: boolean;
  requiresDeliveryCode: boolean;
  courierLinkEnabled: boolean;
  isActive: boolean;
}

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: "در انتظار پرداخت", cls: "bg-gray-100 text-gray-600" },
  PAID: { label: "پرداخت‌شده — در صف", cls: "bg-amber-50 text-amber-700" },
  PROCESSING: { label: "در حال آماده‌سازی", cls: "bg-blue-50 text-blue-700" },
  SHIPPED: { label: "ارسال‌شده", cls: "bg-indigo-50 text-indigo-700" },
  DELIVERED: { label: "تحویل‌شده", cls: "bg-green-50 text-green-700" },
  CANCELLED: { label: "لغوشده", cls: "bg-red-50 text-red-600" },
};

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "همه" },
  { key: "PAID", label: "در صف آماده‌سازی" },
  { key: "PROCESSING", label: "در حال آماده‌سازی" },
  { key: "SHIPPED", label: "ارسال‌شده" },
  { key: "DELIVERED", label: "تحویل‌شده" },
  { key: "PENDING_PAYMENT", label: "در انتظار پرداخت" },
  { key: "CANCELLED", label: "لغوشده" },
];

const VIA_FA: Record<string, string> = {
  DELIVERY_CODE: "تأیید ادمین با کد تحویل مشتری",
  COURIER_LINK: "ثبت پیک با کد تحویل مشتری",
  ADMIN_OVERRIDE: "تأیید استثنایی بدون کد",
};
const ACTOR_FA: Record<string, string> = { USER: "مشتری", ADMIN: "پنل", SYSTEM: "سیستم", COURIER: "پیک" };
const SMS_STATUS_FA: Record<string, string> = { SENT: "ارسال شد", FAILED: "ناموفق", DRY_RUN: "آزمایشی", SKIPPED: "ارسال نشد" };

/** وضعیت‌هایی که برچسب ارسال برایشان چاپ می‌شود */
const LABEL_STATUSES: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];
const labelUrl = (ids: string[], auto = false) => `/labels/print?orders=${ids.join(",")}${auto ? "&auto=1" : ""}`;

const tomanFa = (v: string | number) => `${Math.round(Number(v)).toLocaleString("fa-IR")} تومان`;

export default function ShopOrdersPage() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const can = usePerm();
  const canPrint = can("shop.label.print");

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (status) qs.set("status", status);
  if (search) qs.set("q", search);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading, mutate } = useSWR<ListResp>(`/api/admin/shop-orders?${qs.toString()}`, fetcher);
  const printable = (data?.data ?? []).filter((o) => LABEL_STATUSES.includes(o.status));
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={ShoppingBag}
        title="سفارشات فروشگاه"
        subtitle="آماده‌سازی، ارسال با مرجع دلخواه (پست، پیک، پست خصوصی، تحویل حضوری) و تأیید تحویل با کد تحویل مشتری. در هر مرحله پیامک مطابق متن تعریف‌شده در مرکز پیامک برای مشتری ارسال می‌شود."
        actions={
          <div className="flex flex-wrap gap-2">
            {canPrint && selected.size > 0 && (
              <a
                href={labelUrl([...selected])}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                <Printer className="w-4 h-4" /> چاپ برچسب {selected.size.toLocaleString("fa-IR")} سفارش
              </a>
            )}
            <Link href="/shop/shipping-methods" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700">
              <Truck className="w-4 h-4" /> مراجع ارسال
            </Link>
          </div>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setStatus(f.key);
              setPage(1);
            }}
            className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border ${status === f.key ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600"}`}
            style={status === f.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {f.label}
            {f.key && data?.statusCounts?.[f.key] ? ` (${data.statusCounts[f.key].toLocaleString("fa-IR")})` : ""}
          </button>
        ))}
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <DateRange
          from={from}
          to={to}
          onFrom={(v) => {
            setFrom(v);
            setPage(1);
          }}
          onTo={(v) => {
            setTo(v);
            setPage(1);
          }}
        >
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q.trim());
              setPage(1);
            }}
          >
            <label className="text-[12px] font-bold text-gray-600">
              جستجو
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="شماره سفارش، موبایل، کد رهگیری، گیرنده"
                className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white w-64"
              />
            </label>
            <button type="submit" className="px-3 py-2 rounded-xl border border-gray-200 bg-white">
              <Search className="w-4 h-4" />
            </button>
          </form>
        </DateRange>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : data.data.length === 0 ? (
        <Empty text="سفارشی یافت نشد" />
      ) : (
        <div className="space-y-2">
          {canPrint && printable.length > 0 && (
            <label className="flex items-center gap-2 px-1 text-[12px] font-bold text-gray-600">
              <input
                type="checkbox"
                checked={printable.every((o) => selected.has(o.id))}
                onChange={(e) =>
                  setSelected((cur) => {
                    const next = new Set(cur);
                    printable.forEach((o) => (e.target.checked ? next.add(o.id) : next.delete(o.id)));
                    return next;
                  })
                }
              />
              انتخاب همه‌ی سفارش‌های قابل چاپ برچسب در این صفحه
            </label>
          )}
          {data.data.map((o) => (
            <div key={o.id} className="flex items-stretch gap-2">
              {canPrint && (
                <label className="flex items-center px-1" title="انتخاب برای چاپ گروهی برچسب">
                  <input type="checkbox" disabled={!LABEL_STATUSES.includes(o.status)} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                </label>
              )}
              <button
                type="button"
                onClick={() => setOpenId(o.id)}
                className="flex-1 min-w-0 text-right rounded-2xl p-4 hover:shadow-sm transition-shadow"
                style={cardStyle}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-black text-[13px]" dir="ltr">
                      {o.orderNumber ?? o.id.slice(0, 8)}
                    </span>
                    <Badge map={ORDER_STATUS} value={o.status} />
                    {o.labelPrintCount > 0 && (
                      <span className="badge bg-emerald-50 text-emerald-700 flex items-center gap-1">
                        <Printer className="w-3 h-3" /> برچسب چاپ شد
                      </span>
                    )}
                  </div>
                  <span className="font-black text-[14px]">{tomanFa(o.totalToman)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-gray-500">
                  <span>
                    {o.user.fullName ?? "—"} <span dir="ltr">{o.user.phone}</span>
                  </span>
                  <span>{faDateTime(o.createdAt)}</span>
                  <span>
                    {o.items.length.toLocaleString("fa-IR")} قلم — {o.items.map((i) => i.productName).join("، ").slice(0, 60)}
                  </span>
                  {o.shipping && (
                    <span className="flex items-center gap-1">
                      <Truck className="w-3.5 h-3.5" /> {o.shipping.methodName}
                      {o.shipping.trackingCode && <span dir="ltr">({o.shipping.trackingCode})</span>}
                    </span>
                  )}
                </div>
              </button>
            </div>
          ))}
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </div>
      )}

      {openId && (
        <OrderDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void mutate()}
        />
      )}
    </div>
  );
}

// ═══════════════════════════ جزئیات سفارش ═══════════════════════════

function OrderDrawer({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: o, mutate } = useSWR<OrderDetail>(`/api/admin/shop-orders/${id}`, fetcher);
  const can = usePerm();
  const act = useAction();
  const [modal, setModal] = useState<"ship" | "deliver" | "override" | "cancel" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = () => {
    void mutate();
    onChanged();
  };
  const run = async (fn: () => Promise<unknown>, confirmText?: string) => {
    if (await act.run(fn, confirmText)) refresh();
  };

  return (
    <Modal title={o ? `سفارش ${o.orderNumber ?? o.id.slice(0, 8)}` : "سفارش"} onClose={onClose} wide>
      {!o ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge map={ORDER_STATUS} value={o.status} />
            <span className="text-gray-500">{faDateTime(o.createdAt)}</span>
            {o.invoiceId && (
              <a href={`/invoices/${o.invoiceId}/print`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-emerald-700 font-bold text-[12px]">
                <FileText className="w-3.5 h-3.5" /> فاکتور
              </a>
            )}
            {can("shop.label.print") && LABEL_STATUSES.includes(o.status) && (
              <a href={labelUrl([o.id])} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-emerald-700 font-bold text-[12px]">
                <Printer className="w-3.5 h-3.5" /> چاپ برچسب
                {o.labelPrintCount > 0 && (
                  <span className="text-gray-400 font-normal">
                    ({o.labelPrintCount.toLocaleString("fa-IR")} بار — آخرین {faDateTime(o.labelPrintedAt)})
                  </span>
                )}
              </a>
            )}
          </div>

          {act.error && <Alert kind="error" text={act.error} />}
          {act.success && <Alert kind="success" text={act.success} />}

          {/* ── اقدامات ── */}
          {can("shop.manage") && (
            <div className="flex flex-wrap gap-2">
              {o.status === "PAID" && (
                <ActionButton busy={act.busy} onClick={() => void run(() => api.post(`/api/admin/shop-orders/${o.id}/process`))}>
                  <Clock className="w-4 h-4" /> شروع آماده‌سازی
                </ActionButton>
              )}
              {(o.status === "PAID" || o.status === "PROCESSING") && (
                <ActionButton onClick={() => setModal("ship")}>
                  <Truck className="w-4 h-4" /> ثبت ارسال
                </ActionButton>
              )}
              {o.status === "SHIPPED" && (
                <>
                  <ActionButton onClick={() => setModal("deliver")}>
                    <PackageCheck className="w-4 h-4" /> ثبت تحویل با کد مشتری
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    busy={act.busy}
                    onClick={() =>
                      void run(
                        () => api.post(`/api/admin/shop-orders/${o.id}/delivery-code/resend`, { regenerate: false }),
                        "کد تحویل مجدداً برای مشتری پیامک شود؟",
                      )
                    }
                  >
                    <MessageSquareText className="w-4 h-4" /> ارسال مجدد کد
                  </ActionButton>
                  <ActionButton
                    variant="secondary"
                    busy={act.busy}
                    onClick={() =>
                      void run(
                        () => api.post(`/api/admin/shop-orders/${o.id}/delivery-code/resend`, { regenerate: true }),
                        "کد تحویل جدید صادر شود؟ کد قبلی باطل می‌شود.",
                      )
                    }
                  >
                    <KeyRound className="w-4 h-4" /> صدور کد جدید
                  </ActionButton>
                  {can("shop.delivery.override") && (
                    <ActionButton variant="danger" onClick={() => setModal("override")}>
                      تأیید تحویل بدون کد
                    </ActionButton>
                  )}
                </>
              )}
              {(o.status === "PAID" || o.status === "PROCESSING" || o.status === "PENDING_PAYMENT") && (
                <ActionButton variant="danger" onClick={() => setModal("cancel")}>
                  <XCircle className="w-4 h-4" /> لغو سفارش
                </ActionButton>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* مشتری و نشانی */}
            <div className="rounded-xl border border-gray-100 p-3 space-y-1.5">
              <p className="font-black text-[12px] text-gray-500">مشتری</p>
              <p>
                {o.user.fullName ?? "—"} — <span dir="ltr">{o.user.phone}</span>
              </p>
              {o.user.nationalCode && <p className="text-gray-500">کد ملی: {o.user.nationalCode}</p>}
              {o.address && (
                <div className="flex items-start gap-1.5 text-gray-600 pt-1">
                  <MapPin className="w-3.5 h-3.5 mt-1 shrink-0" />
                  <span>
                    {[o.address.province, o.address.city].filter(Boolean).join("، ")} — {o.address.fullAddress}
                    {o.address.postalCode && ` — کدپستی ${o.address.postalCode}`}
                    <br />
                    گیرنده: {o.address.receiverName ?? "—"} <span dir="ltr">{o.address.receiverPhone ?? ""}</span>
                  </span>
                </div>
              )}
            </div>

            {/* ارسال و تحویل */}
            <div className="rounded-xl border border-gray-100 p-3 space-y-1.5">
              <p className="font-black text-[12px] text-gray-500">ارسال و تحویل</p>
              {o.delivery?.shipping ? (
                <ShippingSummary s={o.delivery.shipping} />
              ) : (
                <p className="text-gray-400">هنوز ارسال نشده است</p>
              )}
              {o.delivery?.cancelReason && <p className="text-red-600">دلیل لغو: {o.delivery.cancelReason}</p>}
            </div>
          </div>

          {/* اقلام */}
          <div className="rounded-xl border border-gray-100 p-3 space-y-2">
            <p className="font-black text-[12px] text-gray-500">اقلام سفارش</p>
            {o.items.map((item) => (
              <div key={item.id} className="text-[12px]">
                <div className="flex justify-between">
                  <span>
                    {item.productName} — {Number(item.weightGrams).toLocaleString("fa-IR")} گرم × {item.quantity.toLocaleString("fa-IR")}
                  </span>
                  <span className="font-bold">{tomanFa(item.lineTotalToman)}</span>
                </div>
                {item.packaging && (
                  <div className="flex items-center gap-1 text-amber-700 text-[11px]">
                    <Box className="w-3 h-3" /> بسته‌بندی: {item.packaging.name} × {item.packaging.quantity.toLocaleString("fa-IR")}{" "}
                    {item.packaging.free ? "(رایگان)" : ""}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(item.id)}
                  dir="ltr"
                  title="کپی شناسه آیتم برای تخصیص کد هولوگرام"
                  className="text-[10px] text-gray-300 hover:text-gray-500 font-mono"
                >
                  {item.id}
                </button>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 space-y-0.5 text-[12px]">
              <p className="flex justify-between text-gray-500">
                <span>جمع اقلام</span>
                <span>{tomanFa(o.subtotalToman)}</span>
              </p>
              {Number(o.packagingToman) > 0 && (
                <p className="flex justify-between text-gray-500">
                  <span>بسته‌بندی</span>
                  <span>{tomanFa(o.packagingToman)}</span>
                </p>
              )}
              {Number(o.discountToman) > 0 && (
                <p className="flex justify-between text-emerald-700">
                  <span>تخفیف {o.discountCode && <span dir="ltr">({o.discountCode})</span>}</span>
                  <span>− {tomanFa(o.discountToman)}</span>
                </p>
              )}
              <p className="flex justify-between font-black text-[14px]">
                <span>مبلغ پرداختی</span>
                <span>{tomanFa(o.totalToman)}</span>
              </p>
            </div>
            {o.payments.length > 0 && (
              <div className="text-[11px] text-gray-500 space-y-0.5">
                {o.payments.map((p) => (
                  <p key={p.id}>
                    {p.method === "WALLET" ? "کیف پول" : `درگاه ${p.gatewayProvider ?? ""}`} — {tomanFa(p.amountToman)} —{" "}
                    {p.status === "SUCCESS" ? "موفق" : p.status === "FAILED" ? "ناموفق" : "در انتظار"}
                    {p.gatewayTrackingCode && <span dir="ltr"> ({p.gatewayTrackingCode})</span>}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="font-black text-[12px] text-gray-500 mb-2">روند سفارش</p>
              <ol className="space-y-2">
                {(o.delivery?.timeline ?? []).map((t) => (
                  <li key={t.id} className="flex gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[12px]">
                        {t.toStatusLabel} <span className="text-gray-400 font-normal">— {ACTOR_FA[t.actorType] ?? t.actorType}</span>
                      </p>
                      {t.note && <p className="text-[11px] text-gray-500">{t.note}</p>}
                      <p className="text-[10px] text-gray-400">{faDateTime(t.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="rounded-xl border border-gray-100 p-3">
              <p className="font-black text-[12px] text-gray-500 mb-2">پیامک‌های این سفارش</p>
              {o.smsLogs.length === 0 ? (
                <p className="text-[12px] text-gray-400">پیامکی ثبت نشده است</p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {o.smsLogs.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span>{l.templateKey}</span>
                      <span className={l.status === "FAILED" ? "text-red-600" : "text-gray-500"}>
                        {SMS_STATUS_FA[l.status] ?? l.status} — {faDateTime(l.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* یادداشت داخلی */}
          {can("shop.manage") && (
            <div className="rounded-xl border border-gray-100 p-3 space-y-2">
              <p className="font-black text-[12px] text-gray-500">یادداشت داخلی (فقط پنل)</p>
              <textarea value={note ?? o.adminNote ?? ""} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} />
              {note !== null && note !== (o.adminNote ?? "") && (
                <ActionButton variant="secondary" busy={act.busy} onClick={() => void run(() => api.patch(`/api/admin/shop-orders/${o.id}/note`, { note }))}>
                  ذخیره یادداشت
                </ActionButton>
              )}
            </div>
          )}

          {modal === "ship" && <ShipModal order={o} onClose={() => setModal(null)} onDone={refresh} />}
          {modal === "deliver" && <DeliverModal order={o} onClose={() => setModal(null)} onDone={refresh} />}
          {modal === "override" && <OverrideModal order={o} onClose={() => setModal(null)} onDone={refresh} />}
          {modal === "cancel" && <CancelModal order={o} onClose={() => setModal(null)} onDone={refresh} />}
        </div>
      )}
    </Modal>
  );
}

function ShippingSummary({ s }: { s: ShippingView }) {
  return (
    <div className="space-y-1 text-[12px]">
      <p className="flex items-center gap-1.5">
        <Truck className="w-3.5 h-3.5" /> {s.method?.name ?? s.carrierName}
      </p>
      {s.trackingCode && (
        <p>
          کد رهگیری: <span dir="ltr" className="font-bold">{s.trackingCode}</span>
          {s.trackingUrl && (
            <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="mr-2 text-emerald-700 font-bold">
              رهگیری
            </a>
          )}
        </p>
      )}
      {s.courierName && (
        <p>
          پیک: {s.courierName} <span dir="ltr">{s.courierPhone}</span>
        </p>
      )}
      {s.estimatedDelivery && <p>تحویل تخمینی: {faDateTime(s.estimatedDelivery)}</p>}
      {s.deliveryCodeRequired && !s.deliveredAt && (
        <p className={s.deliveryCodeLocked ? "text-red-600 font-bold" : "text-gray-600"}>
          کد تحویل برای مشتری پیامک شد{s.deliveryCodeSentAt ? ` (${faDateTime(s.deliveryCodeSentAt)})` : ""}
          {s.deliveryCodeAttempts > 0 && ` — ${s.deliveryCodeAttempts.toLocaleString("fa-IR")} تلاش نادرست`}
          {s.deliveryCodeLocked && " — قفل شده؛ کد جدید صادر کنید"}
        </p>
      )}
      {s.deliveredAt && (
        <p className="text-green-700 font-bold">
          تحویل: {faDateTime(s.deliveredAt)} — {VIA_FA[s.deliveryConfirmedVia ?? ""] ?? s.deliveryConfirmedVia}
          {s.receivedByName && ` — تحویل‌گیرنده: ${s.receivedByName}`}
        </p>
      )}
      {s.note && <p className="text-gray-500">یادداشت: {s.note}</p>}
    </div>
  );
}

function ShipModal({ order, onClose, onDone }: { order: OrderDetail; onClose: () => void; onDone: () => void }) {
  const { data: methods } = useSWR<ShippingMethod[]>("/api/admin/shop-orders/shipping-methods?active=true", fetcher);
  const [methodId, setMethodId] = useState("");
  const [trackingCode, setTrackingCode] = useState("");
  const [courierName, setCourierName] = useState("");
  const [courierPhone, setCourierPhone] = useState("");
  const [eta, setEta] = useState("");
  const [note, setNote] = useState("");
  const act = useAction();
  const can = usePerm();
  const canPrint = can("shop.label.print");
  const [printLabel, setPrintLabel] = useState(true);
  const m = methods?.find((x) => x.id === methodId);

  const submit = async () => {
    // پنجره همین حالا (هم‌زمان با کلیک) باز می‌شود تا مسدودکننده‌ی پاپ‌آپ جلویش را نگیرد
    const win = canPrint && printLabel ? window.open("about:blank", "_blank") : null;
    const ok = await act.run(() =>
      api.post(`/api/admin/shop-orders/${order.id}/ship`, {
        shippingMethodId: methodId,
        trackingCode: trackingCode || undefined,
        courierName: courierName || undefined,
        courierPhone: courierPhone || undefined,
        estimatedDelivery: eta ? new Date(eta).toISOString() : undefined,
        note: note || undefined,
      }),
    );
    if (ok) {
      // پس از ثبت ارسال، برچسب با کد رهگیری و مرجع ارسال چاپ می‌شود
      if (win) win.location.href = labelUrl([order.id], true);
      onDone();
      onClose();
    } else {
      win?.close();
    }
  };

  return (
    <Modal title="ثبت ارسال سفارش" onClose={onClose}>
      <div className="space-y-3">
        <Field label="مرجع ارسال">
          <select value={methodId} onChange={(e) => setMethodId(e.target.value)} className={inputCls}>
            <option value="">انتخاب کنید</option>
            {(methods ?? []).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </Field>
        {m && (
          <>
            {m.type !== "PICKUP" && (
              <Field label={`کد رهگیری مرسوله${m.requiresTrackingCode ? " (الزامی)" : " (اختیاری)"}`}>
                <input value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
              </Field>
            )}
            {(m.type === "COURIER" || m.courierLinkEnabled) && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="نام پیک">
                  <input value={courierName} onChange={(e) => setCourierName(e.target.value)} className={inputCls} />
                </Field>
                <Field label={`موبایل پیک${m.courierLinkEnabled ? " (الزامی)" : ""}`}>
                  <input value={courierPhone} onChange={(e) => setCourierPhone(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
                </Field>
              </div>
            )}
            {m.type !== "PICKUP" && (
              <Field label="زمان تخمینی تحویل (اختیاری)">
                <JalaliDateInput value={eta} onChange={setEta} />
              </Field>
            )}
            <Field label="یادداشت (اختیاری)">
              <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
            </Field>
            <div className="rounded-xl bg-emerald-50 p-3 text-[12px] text-emerald-900 space-y-1">
              {m.requiresDeliveryCode && <p>• کد تحویل ۶ رقمی برای مشتری پیامک و در اپ او نمایش داده می‌شود؛ تحویل فقط با این کد ثبت می‌شود.</p>}
              {m.courierLinkEnabled && <p>• لینک ثبت تحویل برای پیک پیامک می‌شود تا پس از گرفتن کد از مشتری، تحویل را ثبت کند.</p>}
              {m.type === "PICKUP" && <p>• پیامک «آماده‌ی تحویل حضوری» برای مشتری ارسال می‌شود.</p>}
            </div>
          </>
        )}
        {canPrint && (
          <label className="flex items-center gap-2 text-[12px] font-bold">
            <input type="checkbox" checked={printLabel} onChange={(e) => setPrintLabel(e.target.checked)} />
            چاپ برچسب ارسال پس از ثبت
          </label>
        )}
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton busy={act.busy} disabled={!methodId} onClick={() => void submit()}>
          ثبت ارسال و اطلاع به مشتری
        </ActionButton>
      </div>
    </Modal>
  );
}

function DeliverModal({ order, onClose, onDone }: { order: OrderDetail; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [receiver, setReceiver] = useState("");
  const act = useAction();
  const needsCode = order.delivery?.shipping?.deliveryCodeRequired ?? false;
  const submit = async () => {
    const ok = await act.run(() =>
      api.post(`/api/admin/shop-orders/${order.id}/deliver`, { deliveryCode: code || undefined, receivedByName: receiver || undefined }),
    );
    if (ok) {
      onDone();
      onClose();
    }
  };
  return (
    <Modal title="ثبت تحویل سفارش" onClose={onClose}>
      <div className="space-y-3">
        {needsCode ? (
          <p className="text-[12px] text-gray-600">کد تحویلی را که مشتری هنگام دریافت مرسوله به مأمور تحویل/پست اعلام کرده وارد کنید.</p>
        ) : (
          <p className="text-[12px] text-gray-600">برای این ارسال کد تحویل صادر نشده است (ارسال قدیمی یا مرجع بدون کد).</p>
        )}
        {needsCode && (
          <Field label="کد تحویل مشتری">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              maxLength={8}
              className={`${inputCls} text-center tracking-[0.5em] text-lg font-black`}
              dir="ltr"
            />
          </Field>
        )}
        <Field label="نام تحویل‌گیرنده (اختیاری)">
          <input value={receiver} onChange={(e) => setReceiver(e.target.value)} className={inputCls} />
        </Field>
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton busy={act.busy} disabled={needsCode && code.length < 4} onClick={() => void submit()}>
          تأیید تحویل
        </ActionButton>
      </div>
    </Modal>
  );
}

function OverrideModal({ order, onClose, onDone }: { order: OrderDetail; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [receiver, setReceiver] = useState("");
  const act = useAction();
  const submit = async () => {
    const ok = await act.run(() =>
      api.post(`/api/admin/shop-orders/${order.id}/deliver-override`, { reason, receivedByName: receiver || undefined }),
    );
    if (ok) {
      onDone();
      onClose();
    }
  };
  return (
    <Modal title="تأیید تحویل بدون کد (استثنایی)" onClose={onClose}>
      <div className="space-y-3">
        <Alert kind="warn" text="این اقدام با نام شما در گزارش فعالیت‌ها ثبت می‌شود. فقط وقتی استفاده کنید که تحویل با مدارک دیگر (رسید امضاشده پست، تماس ضبط‌شده و ...) محرز است." />
        <Field label="دلیل و مستند تحویل (الزامی)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} />
        </Field>
        <Field label="نام تحویل‌گیرنده">
          <input value={receiver} onChange={(e) => setReceiver(e.target.value)} className={inputCls} />
        </Field>
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton variant="danger" busy={act.busy} disabled={reason.trim().length < 10} onClick={() => void submit()}>
          ثبت تحویل بدون کد
        </ActionButton>
      </div>
    </Modal>
  );
}

function CancelModal({ order, onClose, onDone }: { order: OrderDetail; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const act = useAction();
  const submit = async () => {
    const ok = await act.run(() => api.post(`/api/admin/shop-orders/${order.id}/cancel`, { reason: reason || undefined }));
    if (ok) {
      onDone();
      onClose();
    }
  };
  return (
    <Modal title="لغو سفارش" onClose={onClose}>
      <div className="space-y-3">
        {order.status !== "PENDING_PAYMENT" && (
          <Alert kind="info" text={`مبلغ ${tomanFa(order.totalToman)} به کیف پول مشتری بازگردانده و سند برگشت فروش ثبت می‌شود.`} />
        )}
        <Field label="دلیل لغو (برای مشتری پیامک می‌شود)">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} />
        </Field>
        {act.error && <Alert kind="error" text={act.error} />}
        <ActionButton variant="danger" busy={act.busy} onClick={() => void submit()}>
          لغو سفارش
        </ActionButton>
      </div>
    </Modal>
  );
}
