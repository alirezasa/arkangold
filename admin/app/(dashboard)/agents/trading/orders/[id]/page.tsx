// admin/app/(dashboard)/agents/trading/orders/[id]/page.tsx
//
// جزئیات سفارش خرید نماینده در پنل مدیریت: تأیید و تخصیص شمش‌های کددار خزانه (صدور صورتحساب
// به نام نماینده، حواله و سند)، ثبت تحویل، ثبت رسید کتبی و لغو.
"use client";
import { use, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import { ArrowRight, FileText, Loader2, PackageCheck, Truck } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import {
  Alert,
  Badge,
  PURITY_FA,
  Spinner,
  cardStyle,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
} from "@/app/components/agents/ui";
import { DEPOSIT_STATUS, PURCHASE_STATUS, type PurchaseOrder } from "@/app/components/agents/trading";

interface Candidates {
  orderNumber: string;
  groups: {
    itemId: string;
    title: string;
    weightGrams: string;
    purityKarat: string;
    quantity: number;
    available: { code: string; factorySerialNumber: string | null; vaultCodedAt: string | null }[];
  }[];
}

export default function AdminPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { me } = useAdminMe();
  const canManage = me?.permissions.includes("agent.order.manage") ?? false;
  const { data: o, mutate, error } = useSWR<PurchaseOrder>(`/api/admin/agents/trading/orders/${id}`, fetcher);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [allocating, setAllocating] = useState(false);

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "success", text: ok });
      setAllocating(false);
      await mutate();
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "عملیات ناموفق بود") });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Alert kind="error" text={getErrorMessage(error, "سفارش یافت نشد")} />;
  if (!o) return <Spinner />;

  return (
    <div className="space-y-5">
      <Link href="/agents/trading" className="inline-flex items-center gap-1 text-[12px] font-bold text-gray-500">
        <ArrowRight className="w-4 h-4" /> بازگشت به کارتابل
      </Link>

      <div className="rounded-2xl p-5 space-y-3" style={cardStyle}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-[17px] font-black flex items-center gap-2">
            سفارش خرید <span dir="ltr">{o.orderNumber}</span> <Badge map={PURCHASE_STATUS} value={o.status} />
          </h1>
          <Link href={`/agents/${o.agent.id}`} className="text-[12px] font-bold underline">
            {o.agent.name} ({o.agent.code})
          </Link>
        </div>
        <div className="grid gap-2 sm:grid-cols-3 text-[12px]">
          <p>
            ثبت: <b>{faDateTime(o.createdAt)}</b>
          </p>
          <p>
            قفل قیمت تا: <b>{faDateTime(o.priceLockedUntil)}</b>
          </p>
          <p>
            روش پرداخت: <b>{o.paymentMethodLabel}</b>
          </p>
          <p>
            پرداخت: <b>{o.paidAt ? faDateTime(o.paidAt) : "—"}</b>
          </p>
          <p>
            تحویل: <b>{o.deliveryMethod === "SHIPPING" ? `ارسال به ${o.deliveryAddress ?? "—"}` : "حضوری از محل شرکت"}</b>
          </p>
          {o.creditDueAt && (
            <p>
              سررسید اعتبار: <b>{faDateTime(o.creditDueAt)}</b>
            </p>
          )}
        </div>
        {o.note && <p className="text-[12px] rounded-xl bg-gray-50 p-2">یادداشت نماینده: {o.note}</p>}
        {o.cancelReason && <Alert kind="warn" text={`دلیل لغو: ${o.cancelReason}`} />}
      </div>

      <div className="rounded-2xl p-5 space-y-3" style={cardStyle}>
        <h2 className="text-[14px] font-black">اقلام (قیمت قفل‌شده)</h2>
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[560px]">
            <thead>
              <tr>
                <th>شرح</th>
                <th>تعداد</th>
                <th>ارزش طلا (ت)</th>
                <th>اجرت (ت)</th>
                <th>جمع (ت)</th>
              </tr>
            </thead>
            <tbody>
              {o.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {i.title} — {faNum(i.weightGrams, 4)} گرم {PURITY_FA[i.purityKarat] ?? i.purityKarat}
                  </td>
                  <td>{faNum(i.quantity)}</td>
                  <td>{toman(i.unitGoldValueRial)}</td>
                  <td>{toman(i.unitPremiumRial)}</td>
                  <td className="font-black">{toman(i.lineTotalRial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px]">
          جمع کل: <b>{toman(o.totalRial)} تومان</b> — {faNum(o.totalWeightGrams, 4)} گرم
        </p>
      </div>

      {!!o.deposits?.length && (
        <div className="rounded-2xl p-5 space-y-2 text-[12px]" style={cardStyle}>
          <h2 className="text-[14px] font-black">واریزهای مرتبط</h2>
          {o.deposits.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 border-b border-gray-50 py-1.5 flex-wrap">
              <span dir="ltr">{d.requestNumber}</span>
              <span>{d.method === "GATEWAY" ? "درگاه" : "واریز بانکی"}</span>
              <span dir="ltr">{d.bankReference ?? "—"}</span>
              <span className="font-bold">{toman(d.amountRial)} ت</span>
              <Badge map={DEPOSIT_STATUS} value={d.status} />
            </div>
          ))}
          {o.status === "PAYMENT_REVIEW" && (
            <p className="text-amber-700">واریز را از تب «واریزهای بانکی» کارتابل تطبیق و تأیید کنید؛ با تأیید، سفارش پرداخت‌شده می‌شود.</p>
          )}
        </div>
      )}

      {msg && <Alert kind={msg.kind} text={msg.text} />}

      {canManage && (
        <div className="flex gap-2 flex-wrap">
          {o.status === "PAID" && !allocating && (
            <button type="button" onClick={() => setAllocating(true)} className={primaryBtn} style={primaryBtnStyle}>
              <PackageCheck className="w-4 h-4" /> تأیید و تخصیص شمش
            </button>
          )}
          {o.status === "APPROVED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                act(() => axios.post(`/api/admin/agents/trading/orders/${id}/deliver`, {}), "تحویل شمش‌ها ثبت شد")
              }
              className={primaryBtn}
              style={primaryBtnStyle}
            >
              <Truck className="w-4 h-4" /> ثبت تحویل به نماینده
            </button>
          )}
          {o.status === "DELIVERED" && !o.receiptConfirmedAt && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirm("رسید کتبی امضاشده‌ی نماینده دریافت شده است؟") &&
                act(() => axios.post(`/api/admin/agents/trading/orders/${id}/confirm-receipt`), "رسید تحویل ثبت شد")
              }
              className={secondaryBtn}
            >
              ثبت رسید کتبی نماینده
            </button>
          )}
          {["PENDING_PAYMENT", "PAYMENT_REVIEW", "PAID"].includes(o.status) && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("دلیل لغو سفارش (وجه پرداخت‌شده به کیف پول نماینده برمی‌گردد):");
                if (reason && reason.trim().length >= 5)
                  void act(() => axios.post(`/api/admin/agents/trading/orders/${id}/cancel`, { reason: reason.trim() }), "سفارش لغو شد");
              }}
              className={secondaryBtn}
            >
              لغو سفارش
            </button>
          )}
        </div>
      )}

      {allocating && <AllocatePanel orderId={id} busy={busy} onCancel={() => setAllocating(false)} onSubmit={(codes, note) =>
        act(
          () => axios.post(`/api/admin/agents/trading/orders/${id}/approve`, { codes, adminNote: note || undefined }),
          "سفارش تأیید شد؛ صورتحساب به نام نماینده و حواله صادر شد",
        )
      } />}

      {(o.invoiceId || o.proformaInvoiceId || o.voucherNumber) && (
        <div className="rounded-2xl p-5 space-y-2 text-[12px]" style={cardStyle}>
          <h2 className="text-[14px] font-black">اسناد</h2>
          <div className="flex gap-2 flex-wrap">
            {o.proformaInvoiceId && (
              <a href={`/invoices/${o.proformaInvoiceId}/print`} target="_blank" rel="noreferrer" className={secondaryBtn}>
                <FileText className="w-4 h-4" /> پیش‌فاکتور
              </a>
            )}
            {o.invoiceId && (
              <a href={`/invoices/${o.invoiceId}/print`} target="_blank" rel="noreferrer" className={secondaryBtn}>
                <FileText className="w-4 h-4" /> صورتحساب فروش به نام نماینده
              </a>
            )}
            {o.voucherNumber && (
              <a href={`/agent-docs/voucher/${encodeURIComponent(o.voucherNumber)}`} target="_blank" rel="noreferrer" className={secondaryBtn}>
                <FileText className="w-4 h-4" /> حواله {o.voucherNumber}
              </a>
            )}
          </div>
          {!!o.bars?.length && (
            <p className="leading-7">
              شمش‌های تخصیص‌یافته:{" "}
              {o.bars.map((b) => (
                <span key={b.code} className="inline-block font-mono bg-gray-50 rounded px-1.5 mx-0.5" dir="ltr">
                  {b.code}
                </span>
              ))}
            </p>
          )}
          {o.receiptConfirmedAt && <p className="text-green-700">رسید تحویل: {faDateTime(o.receiptConfirmedAt)}</p>}
        </div>
      )}
    </div>
  );
}

function AllocatePanel({
  orderId,
  busy,
  onCancel,
  onSubmit,
}: {
  orderId: string;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (codes: string[], note: string) => void;
}) {
  const { data, error } = useSWR<Candidates>(`/api/admin/agents/trading/orders/${orderId}/candidates`, fetcher);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [note, setNote] = useState("");
  if (error) return <Alert kind="error" text={getErrorMessage(error, "دریافت شمش‌های آزاد ممکن نشد")} />;
  if (!data) return <Spinner />;

  const pickedFor = (itemId: string) => picked[itemId] ?? [];
  const toggle = (itemId: string, code: string, max: number) => {
    const cur = pickedFor(itemId);
    if (cur.includes(code)) setPicked({ ...picked, [itemId]: cur.filter((c) => c !== code) });
    else if (cur.length < max) setPicked({ ...picked, [itemId]: [...cur, code] });
  };
  const autoFill = () =>
    setPicked(Object.fromEntries(data.groups.map((g) => [g.itemId, g.available.slice(0, g.quantity).map((b) => b.code)])));
  const complete = data.groups.every((g) => pickedFor(g.itemId).length === g.quantity);
  const codes = data.groups.flatMap((g) => pickedFor(g.itemId));

  return (
    <div className="rounded-2xl p-5 space-y-4" style={cardStyle}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-[14px] font-black">تخصیص شمش‌های کددار خزانه</h2>
        <button type="button" onClick={autoFill} className={secondaryBtn}>
          انتخاب خودکار (قدیمی‌ترین)
        </button>
      </div>
      <Alert
        kind="info"
        text="با تأیید: شمش‌ها به مالکیت نماینده درمی‌آیند (AGENT_OWNED)، صورتحساب فروش با کدهای هولوگرام به نام نماینده صادر، حواله‌ی خروج ثبت و سند فروش و بهای تمام‌شده زده می‌شود. پیش از تأیید، کد هولوگرام شمش‌های فیزیکی را با فهرست تطبیق دهید."
      />
      {data.groups.map((g) => (
        <div key={g.itemId} className="space-y-2">
          <p className="text-[12px] font-bold">
            {g.title} — {faNum(g.weightGrams, 4)} گرم {PURITY_FA[g.purityKarat] ?? g.purityKarat}: {faNum(pickedFor(g.itemId).length)} از{" "}
            {faNum(g.quantity)}
            {g.available.length < g.quantity && <span className="text-red-600"> — موجودی آزاد کافی نیست ({faNum(g.available.length)})</span>}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.available.map((b) => {
              const on = pickedFor(g.itemId).includes(b.code);
              return (
                <button
                  key={b.code}
                  type="button"
                  onClick={() => toggle(g.itemId, b.code, g.quantity)}
                  className={`font-mono text-[11px] px-2 py-1 rounded-lg border ${on ? "bg-emerald-50 border-emerald-400 text-emerald-800" : "border-gray-200"}`}
                  dir="ltr"
                  title={b.factorySerialNumber ?? undefined}
                >
                  {b.code}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <input
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[12px]"
        placeholder="یادداشت مدیریت (اختیاری)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !complete}
          onClick={() => onSubmit(codes, note)}
          className={primaryBtn}
          style={primaryBtnStyle}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "تأیید، صدور صورتحساب و حواله"}
        </button>
        <button type="button" onClick={onCancel} className={secondaryBtn}>
          انصراف
        </button>
      </div>
    </div>
  );
}
