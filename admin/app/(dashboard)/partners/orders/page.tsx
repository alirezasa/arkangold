// admin/app/(dashboard)/partners/orders/page.tsx — سفارش‌ها / قراردادهای شرکای فروش
"use client";
import { useState } from "react";
import useSWR from "swr";
import { Plus, ReceiptText } from "lucide-react";
import {
  ActionButton,
  Alert,
  Badge,
  CsvButton,
  Field,
  Modal,
  Num,
  PARTNER_ORDER_STATUS,
  PageHeader,
  Pagination,
  Spinner,
  Table,
  api,
  cardStyle,
  downloadCsv,
  faDate,
  faDateTime,
  fetcher,
  grams,
  inputCls,
  toman,
  tomanToRial,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";
import JournalModal from "@/app/components/finance/JournalModal";

interface PartnerOrder {
  id: string;
  orderNumber: string;
  partnerName?: string;
  partnerCode?: string;
  externalRef: string;
  customer: { fullName?: string; nationalCode?: string; phone?: string } | null;
  productKind: "MELTED_GOLD" | "BULLION";
  status: string;
  amountGrams: string;
  pricePerGramRial: string;
  goldValueRial: string;
  wageRial: string;
  feeRial: string;
  taxRial: string;
  totalRial: string;
  downPaymentRial: string;
  installmentCount: number | null;
  commissionRial: string;
  netReceivableRial: string;
  dueDate: string | null;
  overdue: boolean;
  invoiceId: string | null;
  confirmJournalId: string | null;
  refundJournalId: string | null;
  createdVia: string;
  note: string | null;
  cancelReason: string | null;
  confirmedAt: string | null;
  settledAt: string | null;
  createdAt: string;
  bar?: { code: string; purityKarat: string | null; product: { name: string } | null } | null;
  settlement?: { settlementNumber: string; paidAt: string } | null;
}
interface OrderList {
  data: PartnerOrder[];
  page: number;
  totalPages: number;
  totals: { status: string; count: number; grams: string; totalRial: string; netReceivableRial: string }[];
}
interface PartnerOpt {
  id: string;
  code: string;
  name: string;
  allowedProducts: string[];
  commissionPercent: string;
}

function OrderForm({ partners, onDone }: { partners: PartnerOpt[]; onDone: () => void }) {
  const { data: quote } = useSWR<{ pricePerGramRial: string; feePercent: string; taxPercent: string }>("/api/admin/partners/quote", fetcher);
  const [f, setF] = useState({
    partnerId: "",
    externalRef: "",
    customerPhone: "",
    customerNationalCode: "",
    productKind: "MELTED_GOLD",
    mode: "grams",
    amount: "",
    hologramCode: "",
    wage: "",
    installmentCount: "",
    downPayment: "",
    note: "",
    confirmNow: true,
  });
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));
  const act = useAction();
  const partner = partners.find((p) => p.id === f.partnerId);
  const save = async () => {
    const ok = await act.run(() =>
      api.post("/api/admin/partners/orders", {
        partnerId: f.partnerId,
        externalRef: f.externalRef,
        customerPhone: f.customerPhone,
        customerNationalCode: f.customerNationalCode || undefined,
        productKind: f.productKind,
        amountGrams: f.productKind === "MELTED_GOLD" && f.mode === "grams" ? f.amount : undefined,
        amountRial: f.productKind === "MELTED_GOLD" && f.mode === "rial" ? String(tomanToRial(f.amount)) : undefined,
        hologramCode: f.productKind === "BULLION" ? f.hologramCode : undefined,
        wageRial: f.productKind === "BULLION" && f.wage ? String(tomanToRial(f.wage)) : undefined,
        installmentCount: f.installmentCount ? Number(f.installmentCount) : undefined,
        downPaymentRial: f.downPayment ? String(tomanToRial(f.downPayment)) : undefined,
        note: f.note || undefined,
        confirmNow: f.confirmNow,
      }),
    );
    if (ok) onDone();
  };
  return (
    <div className="space-y-3">
      {quote && (
        <p className="text-[12px] text-gray-500">
          قیمت فروش لحظه‌ای هر گرم ۱۸ عیار: <b>{toman(quote.pricePerGramRial)}</b> تومان — کارمزد خدمات {quote.feePercent}٪ — مالیات {quote.taxPercent}٪
        </p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="شریک فروش">
          <select value={f.partnerId} onChange={(e) => set("partnerId", e.target.value)} className={inputCls}>
            <option value="">انتخاب کنید</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name} ({Number(p.commissionPercent).toLocaleString("fa-IR")}٪)
              </option>
            ))}
          </select>
        </Field>
        <Field label="شناسه قرارداد/سفارش نزد شریک" hint="یکتا برای هر شریک — از ثبت تکراری جلوگیری می‌کند">
          <input value={f.externalRef} onChange={(e) => set("externalRef", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="موبایل مشتری (ثبت‌نام‌شده و احرازشده)">
          <input value={f.customerPhone} onChange={(e) => set("customerPhone", e.target.value)} className={inputCls} dir="ltr" placeholder="09..." />
        </Field>
        <Field label="کد ملی مشتری (کنترل تطابق)">
          <input value={f.customerNationalCode} onChange={(e) => set("customerNationalCode", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="کالا">
          <select value={f.productKind} onChange={(e) => set("productKind", e.target.value)} className={inputCls}>
            {(!partner || partner.allowedProducts.includes("MELTED_GOLD")) && <option value="MELTED_GOLD">طلای آب‌شده (واریز به کیف پول)</option>}
            {(!partner || partner.allowedProducts.includes("BULLION")) && <option value="BULLION">شمش کددار خزانه</option>}
          </select>
        </Field>
        {f.productKind === "MELTED_GOLD" ? (
          <Field label={f.mode === "grams" ? "مقدار (گرم ۷۵۰)" : "مبلغ کل خرید (تومان)"}>
            <div className="flex gap-2">
              <input value={f.amount} onChange={(e) => set("amount", e.target.value)} className={inputCls} dir="ltr" />
              <select value={f.mode} onChange={(e) => set("mode", e.target.value)} className={`${inputCls} w-28`}>
                <option value="grams">گرم</option>
                <option value="rial">تومان</option>
              </select>
            </div>
          </Field>
        ) : (
          <>
            <Field label="کد هولوگرام شمش">
              <input value={f.hologramCode} onChange={(e) => set("hologramCode", e.target.value)} className={inputCls} dir="ltr" />
            </Field>
            <Field label="اجرت/حق ضرب (تومان)">
              <input value={f.wage} onChange={(e) => set("wage", e.target.value)} className={inputCls} dir="ltr" />
            </Field>
          </>
        )}
        <Field label="تعداد اقساط (اطلاعاتی)">
          <input value={f.installmentCount} onChange={(e) => set("installmentCount", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="پیش‌پرداخت مشتری نزد شریک (تومان)">
          <input value={f.downPayment} onChange={(e) => set("downPayment", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
      </div>
      <Field label="توضیحات">
        <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} />
      </Field>
      <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
        <input type="checkbox" checked={f.confirmNow} onChange={(e) => set("confirmNow", e.target.checked)} />
        شریک پرداخت را تأیید کرده — هم‌اکنون تأیید و طلا تحویل شود
      </label>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!f.partnerId || !f.externalRef || !f.customerPhone}>
        ثبت سفارش
      </ActionButton>
    </div>
  );
}

function OrderDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const can = usePerm();
  const { data, mutate } = useSWR<PartnerOrder>(`/api/admin/partners/orders/${id}`, fetcher);
  const act = useAction();
  const [journal, setJournal] = useState<string | null>(null);
  if (!data) return <Spinner />;
  const refresh = () => {
    void mutate();
    onChanged();
  };
  const reasonAction = (path: string, prompt: string) => {
    const reason = window.prompt(prompt);
    if (reason) void act.run(() => api.post(`/api/admin/partners/orders/${id}/${path}`, { reason })).then(refresh);
  };
  const rows: [string, React.ReactNode][] = [
    ["شریک / مرجع", `${data.partnerName} — ${data.externalRef}`],
    ["مشتری", `${data.customer?.fullName ?? ""} — ${data.customer?.phone ?? ""} — ${data.customer?.nationalCode ?? ""}`],
    ["کالا", data.productKind === "MELTED_GOLD" ? `${grams(data.amountGrams)} گرم طلای آب‌شده` : `شمش ${data.bar?.code ?? ""} — ${grams(data.amountGrams)} گرم`],
    ["قیمت هر گرم", `${toman(data.pricePerGramRial)} تومان`],
    ["ارزش طلا / اجرت / کارمزد / مالیات", `${toman(data.goldValueRial)} / ${toman(data.wageRial)} / ${toman(data.feeRial)} / ${toman(data.taxRial)}`],
    ["مبلغ کل سفارش", `${toman(data.totalRial)} تومان`],
    ["کارمزد شریک", `${toman(data.commissionRial)} تومان`],
    ["خالص قابل دریافت از شریک", `${toman(data.netReceivableRial)} تومان`],
    ["اقساط / پیش‌پرداخت", `${data.installmentCount?.toLocaleString("fa-IR") ?? "—"} / ${toman(data.downPaymentRial)}`],
    ["سررسید تسویه", data.dueDate ? `${faDate(data.dueDate)}${data.overdue ? " (معوق)" : ""}` : "—"],
    ["تسویه", data.settlement ? `${data.settlement.settlementNumber} — ${faDate(data.settlement.paidAt)}` : "—"],
    ["ثبت", `${data.createdVia === "API" ? "API شریک" : "پنل"} — ${faDateTime(data.createdAt)}`],
  ];
  const manage = can("partner.order.manage");
  return (
    <div className="space-y-3">
      <Badge map={PARTNER_ORDER_STATUS} value={data.status} />
      <Table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="text-gray-500 w-48">{k}</td>
              <td className="font-bold">{v}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {data.cancelReason && <Alert kind="error" text={data.cancelReason} />}
      <div className="flex flex-wrap gap-3 text-[11px] font-bold">
        {data.confirmJournalId && (
          <button type="button" className="text-blue-700" onClick={() => setJournal(data.confirmJournalId)}>
            سند فروش
          </button>
        )}
        {data.refundJournalId && (
          <button type="button" className="text-blue-700" onClick={() => setJournal(data.refundJournalId)}>
            سند استرداد
          </button>
        )}
        {data.invoiceId && (
          <a className="text-blue-700" href={`/invoices/${data.invoiceId}/print`} target="_blank" rel="noreferrer">
            فاکتور فروش
          </a>
        )}
      </div>
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}
      {manage && (
        <div className="flex flex-wrap gap-2">
          {data.status === "PENDING" && (
            <>
              <ActionButton
                busy={act.busy}
                onClick={() =>
                  void act.run(() => api.post(`/api/admin/partners/orders/${id}/confirm`), "شریک پرداخت را تضمین کرده است؟ با تأیید، طلا به مشتری تحویل و سند فروش صادر می‌شود.").then(refresh)
                }
              >
                تأیید و تحویل طلا
              </ActionButton>
              <ActionButton variant="danger" busy={act.busy} onClick={() => reasonAction("cancel", "دلیل لغو:")}>
                لغو
              </ActionButton>
            </>
          )}
          {(data.status === "CONFIRMED" || data.status === "SETTLED") && (
            <>
              <ActionButton variant="danger" busy={act.busy} onClick={() => reasonAction("refund", "دلیل استرداد (طلا از کیف پول مشتری کسر و سند برگشت می‌خورد):")}>
                استرداد
              </ActionButton>
              {!data.invoiceId && (
                <ActionButton variant="secondary" busy={act.busy} onClick={() => void act.run(() => api.post(`/api/admin/partners/orders/${id}/invoice`)).then(refresh)}>
                  صدور فاکتور
                </ActionButton>
              )}
            </>
          )}
        </div>
      )}
      {journal && <JournalModal id={journal} onClose={() => setJournal(null)} />}
    </div>
  );
}

export default function PartnerOrdersPage() {
  const can = usePerm();
  const { data: partners } = useSWR<{ data: PartnerOpt[] }>("/api/admin/partners?limit=200", fetcher);
  const [partnerId, setPartnerId] = useState("");
  const [status, setStatus] = useState("");
  const [overdue, setOverdue] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page) });
  if (partnerId) qs.set("partnerId", partnerId);
  if (status) qs.set("status", status);
  if (overdue) qs.set("overdue", "true");
  if (search) qs.set("search", search);
  const { data, isLoading, mutate } = useSWR<OrderList>(`/api/admin/partners/orders?${qs}`, fetcher);
  const sel = "px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white";
  const reset = () => setPage(1);

  const exportCsv = () =>
    data &&
    downloadCsv(
      "partner-orders.csv",
      ["شماره", "شریک", "مرجع", "مشتری", "کالا", "گرم", "مبلغ (ریال)", "کارمزد شریک (ریال)", "خالص (ریال)", "وضعیت", "سررسید", "تاریخ"],
      data.data.map((o) => [
        o.orderNumber,
        o.partnerName,
        o.externalRef,
        o.customer?.fullName,
        o.productKind === "MELTED_GOLD" ? "آب‌شده" : "شمش",
        o.amountGrams,
        o.totalRial,
        o.commissionRial,
        o.netReceivableRial,
        PARTNER_ORDER_STATUS[o.status]?.label,
        o.dueDate ? faDate(o.dueDate) : "",
        faDate(o.createdAt),
      ]),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ReceiptText}
        title="سفارش‌های شرکای فروش"
        subtitle="قراردادهای خرید اقساطی و سفارش‌های اپ‌های همکار — از API شریک یا ثبت دستی. در انتظار ← تأیید (تحویل طلا) ← تسویه؛ لغو پیش از تأیید و استرداد پس از آن."
        actions={
          <>
            <CsvButton onClick={exportCsv} />
            {can("partner.order.manage") && (
              <ActionButton onClick={() => setCreating(true)}>
                <Plus className="w-4 h-4" /> ثبت سفارش
              </ActionButton>
            )}
          </>
        }
      />
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <div className="flex flex-wrap gap-2 items-center">
          <select value={partnerId} onChange={(e) => { setPartnerId(e.target.value); reset(); }} className={sel}>
            <option value="">همه‌ی شرکا</option>
            {partners?.data.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => { setStatus(e.target.value); reset(); }} className={sel}>
            <option value="">همه‌ی وضعیت‌ها</option>
            {Object.entries(PARTNER_ORDER_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <input value={search} onChange={(e) => { setSearch(e.target.value); reset(); }} placeholder="شماره، مرجع یا موبایل" className={sel} />
          <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600">
            <input type="checkbox" checked={overdue} onChange={(e) => { setOverdue(e.target.checked); reset(); }} /> فقط معوق
          </label>
        </div>
        {data?.totals.length ? (
          <div className="flex flex-wrap gap-2 text-[11px]">
            {data.totals.map((t) => (
              <span key={t.status} className="px-2 py-1 rounded-lg bg-gray-50 border border-gray-100">
                {PARTNER_ORDER_STATUS[t.status]?.label}: {t.count.toLocaleString("fa-IR")} — {grams(t.grams)} گرم — {toman(t.totalRial)} تومان
              </span>
            ))}
          </div>
        ) : null}
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>شریک / مرجع</th>
                  <th>مشتری</th>
                  <th>کالا</th>
                  <th>مبلغ (تومان)</th>
                  <th>خالص طلب</th>
                  <th>سررسید</th>
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setView(o.id)}>
                    <Num bold>{o.orderNumber}</Num>
                    <td>
                      {o.partnerName}
                      <p className="text-[10px] text-gray-400" dir="ltr">
                        {o.externalRef}
                      </p>
                    </td>
                    <td>{o.customer?.fullName}</td>
                    <td>{o.productKind === "MELTED_GOLD" ? `${grams(o.amountGrams)} گرم آب‌شده` : `شمش ${grams(o.amountGrams)} گرم`}</td>
                    <Num bold>{toman(o.totalRial)}</Num>
                    <Num>{toman(o.netReceivableRial)}</Num>
                    <td className={o.overdue ? "text-red-600 font-bold" : ""}>{o.dueDate ? faDate(o.dueDate) : "—"}</td>
                    <td>
                      <Badge map={PARTNER_ORDER_STATUS} value={o.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
      {creating && (
        <Modal title="ثبت سفارش شریک فروش" onClose={() => setCreating(false)} wide>
          <OrderForm
            partners={(partners?.data ?? []).filter((p) => p)}
            onDone={() => {
              setCreating(false);
              void mutate();
            }}
          />
        </Modal>
      )}
      {view && (
        <Modal title="جزئیات سفارش شریک" onClose={() => setView(null)} wide>
          <OrderDetail id={view} onChanged={() => void mutate()} />
        </Modal>
      )}
    </div>
  );
}
