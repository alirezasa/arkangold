// admin/app/(dashboard)/agent-portal/purchase/[id]/page.tsx
//
// جزئیات سفارش خرید شمش: شمارش معکوس مهلت قیمت، پرداخت (کیف پول/درگاه) یا ثبت مشخصات واریز
// بانکی با پیش‌فاکتور، صورتحساب فروش به نام نماینده، حواله‌ی تحویل و تأیید دریافت (بند ۶-۳).
"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import PaymentResultBanner from "@/app/components/agents/PaymentResultBanner";
import { ArrowRight, CheckCircle2, FileText, Loader2, Printer, Timer } from "lucide-react";
import {
  Alert,
  Badge,
  Field,
  PURITY_FA,
  Spinner,
  cardStyle,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
} from "@/app/components/agents/ui";
import {
  DEPOSIT_STATUS,
  PURCHASE_STATUS,
  TRANSFER_TYPES,
  remainingLabel,
  type AgentBankAccount,
  type PurchaseOrder,
} from "@/app/components/agents/trading";

export default function AgentPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: order, mutate, error } = useSWR<PurchaseOrder>(`/api/agent-portal/purchase-orders/${id}`, fetcher);
  const { data: accounts } = useSWR<AgentBankAccount[]>("/api/agent-portal/bank-accounts", fetcher);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [gateway, setGateway] = useState<"ZARINPAL" | "BEHPARDAKHT">("ZARINPAL");
  const [transfer, setTransfer] = useState({ sourceBankAccountId: "", transferType: "SATNA", bankReference: "" });

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const act = async (fn: () => Promise<{ data: { message?: string; redirectUrl?: string | null } }>) => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await fn();
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setMsg({ kind: "success", text: data.message ?? "انجام شد" });
      void mutate();
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "عملیات ناموفق بود") });
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Alert kind="error" text={getErrorMessage(error, "سفارش یافت نشد")} />;
  if (!order) return <Spinner />;

  const pending = order.status === "PENDING_PAYMENT";
  const lockLeft = new Date(order.priceLockedUntil).getTime() - now;
  const verified = (accounts ?? []).filter((a) => a.status === "VERIFIED");
  const available = Number(order.wallet?.availableRial ?? 0);

  return (
    <div className="space-y-4 max-w-4xl">
      <Link href="/agent-portal/purchase" className="text-[12px] font-bold text-gray-500 flex items-center gap-1">
        <ArrowRight className="w-4 h-4" /> بازگشت به خرید شمش
      </Link>

      <div className="rounded-2xl p-4 flex items-start justify-between gap-3 flex-wrap" style={cardStyle}>
        <div>
          <p className="text-[11px] text-gray-400">سفارش خرید شمش</p>
          <h1 className="text-[18px] font-black text-gray-900" dir="ltr">
            {order.orderNumber}
          </h1>
          <p className="text-[12px] text-gray-500 mt-1">
            {faDateTime(order.createdAt)} — {order.paymentMethodLabel}
          </p>
        </div>
        <div className="text-left space-y-2">
          <Badge map={PURCHASE_STATUS} value={order.status} />
          <p className="text-[18px] font-black">{toman(order.totalRial)} تومان</p>
        </div>
      </div>

      <PaymentResultBanner success="پرداخت درگاه موفق بود." failed="پرداخت درگاه ناموفق بود یا لغو شد." />
      {msg && <Alert kind={msg.kind} text={msg.text} />}

      {pending && (
        <div className={`rounded-2xl p-4 flex items-center gap-3 ${lockLeft > 0 ? "bg-amber-50 border border-amber-200" : "bg-red-50 border border-red-200"}`}>
          <Timer className={`w-6 h-6 ${lockLeft > 0 ? "text-amber-600" : "text-red-600"}`} />
          <div className="text-[12px]">
            <p className="font-black">{lockLeft > 0 ? `مهلت پرداخت با قیمت قفل‌شده: ${remainingLabel(order.priceLockedUntil, now)}` : "مهلت قیمت تمام شده است"}</p>
            <p className="text-gray-600">
              {lockLeft > 0
                ? `تا ${faDateTime(order.priceLockedUntil)} پرداخت کنید یا مشخصات واریز بانکی را ثبت کنید؛ پس از آن سفارش خودبه‌خود لغو می‌شود.`
                : "این سفارش لغو خواهد شد؛ برای خرید، سفارش جدید ثبت کنید."}
            </p>
          </div>
        </div>
      )}
      {order.status === "PAYMENT_REVIEW" && (
        <Alert kind="info" text="مشخصات واریز شما در مهلت ثبت شد و قیمت قفل است. پس از تطبیق با صورتحساب بانک توسط واحد مالی، سفارش پرداخت‌شده محسوب و برای تأیید ارسال می‌شود." />
      )}
      {order.status === "PAID" && (
        <Alert kind="info" text={order.paymentMethod === "CREDIT" ? "سفارش اعتباری ثبت شد و در انتظار تأیید و تخصیص شمش است." : "پرداخت کامل شد. پس از تأیید و تخصیص شمش، صورتحساب به نام شما و حواله‌ی تحویل صادر می‌شود."} />
      )}
      {order.status === "APPROVED" && (
        <Alert
          kind="success"
          text={`سفارش تأیید شد؛ صورتحساب به نام شما و حواله‌ی تحویل صادر شده است.${order.deliveredAt ? " شمش‌ها تحویل شده است؛ پس از بررسی، دریافت را تأیید کنید." : ""}`}
        />
      )}
      {order.cancelReason && <Alert kind="warn" text={`علت لغو: ${order.cancelReason}`} />}

      <div className="rounded-2xl p-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800 mb-3">اقلام سفارش</h2>
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[560px]">
            <thead>
              <tr>
                <th>شمش</th>
                <th>تعداد</th>
                <th>قیمت واحد (تومان)</th>
                <th>جمع (تومان)</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <p className="font-bold">{i.title}</p>
                    <p className="text-[11px] text-gray-400">
                      {faNum(i.weightGrams, 4)} گرم — {PURITY_FA[i.purityKarat] ?? i.purityKarat}
                    </p>
                  </td>
                  <td>{faNum(i.quantity)}</td>
                  <td>
                    {toman(i.unitPriceRial)}
                    <span className="block text-[10px] text-gray-400">اجرت {toman(i.unitPremiumRial)}</span>
                  </td>
                  <td className="font-black">{toman(i.lineTotalRial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-gray-500 mt-2">
          وزن کل {faNum(order.totalWeightGrams, 4)} گرم — ارزش طلا {toman(order.goldValueRial)} + اجرت {toman(order.premiumRial)} تومان —{" "}
          {order.deliveryMethod === "SHIPPING" ? `ارسال به: ${order.deliveryAddress ?? "—"}` : "تحویل حضوری"}
        </p>
      </div>

      {pending && lockLeft > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <h3 className="text-[13px] font-black text-gray-800">پرداخت آنلاین</h3>
            <p className="text-[11px] text-gray-500">موجودی کیف پول: {toman(available)} تومان</p>
            <button
              type="button"
              disabled={busy || available < Number(order.totalRial)}
              onClick={() => act(() => axios.post(`/api/agent-portal/purchase-orders/${id}/pay`, { method: "WALLET" }))}
              className={`${primaryBtn} w-full`}
              style={primaryBtnStyle}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "پرداخت از کیف پول"}
            </button>
            <div className="flex gap-2">
              <select className={inputCls} value={gateway} onChange={(e) => setGateway(e.target.value as "ZARINPAL" | "BEHPARDAKHT")}>
                <option value="ZARINPAL">زرین‌پال</option>
                <option value="BEHPARDAKHT">به‌پرداخت ملت</option>
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(() => axios.post(`/api/agent-portal/purchase-orders/${id}/pay`, { method: "GATEWAY", gateway }))}
                className={`${secondaryBtn} mt-1 whitespace-nowrap`}
              >
                پرداخت با درگاه
              </button>
            </div>
            <p className="text-[10px] text-gray-400">در پرداخت درگاهی فقط مازاد مبلغ بر موجودی کیف پول از درگاه دریافت می‌شود.</p>
          </div>

          <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
            <h3 className="text-[13px] font-black text-gray-800">واریز بانکی (ساتنا/پایا/پل/حساب به حساب)</h3>
            {order.proformaInvoiceId ? (
              <a href={`/invoices/${order.proformaInvoiceId}/print?scope=agent-company`} target="_blank" rel="noreferrer" className={`${secondaryBtn} w-full`}>
                <FileText className="w-4 h-4" /> مشاهده و چاپ پیش‌فاکتور
              </a>
            ) : (
              <p className="text-[11px] text-gray-500">برای دریافت پیش‌فاکتور، سفارش را با روش «واریز بانکی» ثبت کنید.</p>
            )}
            <Field label="حساب مبدأ (تأییدشده)">
              <select className={inputCls} value={transfer.sourceBankAccountId} onChange={(e) => setTransfer({ ...transfer, sourceBankAccountId: e.target.value })}>
                <option value="">انتخاب کنید</option>
                {verified.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bankName} — {a.sheba}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="نوع انتقال">
                <select className={inputCls} value={transfer.transferType} onChange={(e) => setTransfer({ ...transfer, transferType: e.target.value })}>
                  {TRANSFER_TYPES.filter((t) => t.key !== "CARD_TO_CARD").map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="شماره پیگیری">
                <input className={inputCls} dir="ltr" value={transfer.bankReference} onChange={(e) => setTransfer({ ...transfer, bankReference: e.target.value })} />
              </Field>
            </div>
            <button
              type="button"
              disabled={busy || !transfer.sourceBankAccountId || transfer.bankReference.trim().length < 4}
              onClick={() => act(() => axios.post(`/api/agent-portal/purchase-orders/${id}/transfer`, transfer))}
              className={`${primaryBtn} w-full`}
              style={primaryBtnStyle}
            >
              ثبت مشخصات واریز
            </button>
          </div>
        </div>
      )}

      {(order.invoiceId || order.voucherNumber || order.status === "APPROVED") && (
        <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
          <h2 className="text-[14px] font-black text-gray-800">اسناد و تحویل</h2>
          <div className="flex flex-wrap gap-2">
            {order.invoiceId && (
              <a href={`/invoices/${order.invoiceId}/print?scope=agent-company`} target="_blank" rel="noreferrer" className={secondaryBtn}>
                <FileText className="w-4 h-4" /> صورتحساب فروش به نام شما
              </a>
            )}
            {order.voucherNumber && (
              <a href={`/agent-docs/voucher/${encodeURIComponent(order.voucherNumber)}?scope=agent`} target="_blank" rel="noreferrer" className={secondaryBtn}>
                <Printer className="w-4 h-4" /> حواله تحویل
              </a>
            )}
          </div>
          {order.bars && order.bars.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {order.bars.map((b) => (
                <span key={b.code} className="px-2 py-1 rounded-lg bg-gray-50 text-[11px] font-mono" dir="ltr">
                  {b.code} · {faNum(b.weightGrams, 4)}g
                </span>
              ))}
            </div>
          )}
          {order.creditDueAt && <p className="text-[12px] text-amber-700">سررسید پرداخت بدهی اعتباری: {faDateTime(order.creditDueAt)}</p>}
          {order.status === "APPROVED" && (
            <div className="rounded-xl bg-gray-50 p-3 space-y-2">
              <p className="text-[12px] text-gray-600">
                هنگام تحویل، تعداد، وزن درج‌شده، سلامت بسته‌بندی و هولوگرام را بررسی کنید. ادعای کسری یا ایراد ظاهری پس از تأیید رسید پذیرفته
                نیست (بند ۶-۳ قرارداد).
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  confirm("تعداد، وزن، بسته‌بندی و هولوگرام همه‌ی شمش‌ها را بررسی کرده و دریافت را تأیید می‌کنید؟") &&
                  act(() => axios.post(`/api/agent-portal/purchase-orders/${id}/confirm-receipt`))
                }
                className={primaryBtn}
                style={primaryBtnStyle}
              >
                <CheckCircle2 className="w-4 h-4" /> تأیید دریافت شمش‌ها
              </button>
            </div>
          )}
          {order.receiptConfirmedAt && <p className="text-[12px] text-green-700">دریافت در {faDateTime(order.receiptConfirmedAt)} تأیید شد.</p>}
        </div>
      )}

      {order.deposits && order.deposits.length > 0 && (
        <div className="rounded-2xl p-4" style={cardStyle}>
          <h2 className="text-[14px] font-black text-gray-800 mb-2">پرداخت‌های این سفارش</h2>
          {order.deposits.map((d) => (
            <div key={d.id} className="flex items-center justify-between text-[12px] py-1.5 border-b border-gray-50">
              <span dir="ltr">{d.requestNumber}</span>
              <span>{toman(d.amountRial)} تومان</span>
              <Badge map={DEPOSIT_STATUS} value={d.status} />
            </div>
          ))}
        </div>
      )}

      {pending && (
        <button
          type="button"
          disabled={busy}
          onClick={() => confirm("سفارش لغو شود؟") && act(() => axios.post(`/api/agent-portal/purchase-orders/${id}/cancel`))}
          className="text-[12px] font-bold text-red-600"
        >
          لغو سفارش
        </button>
      )}
    </div>
  );
}
