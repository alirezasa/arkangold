// admin/app/(dashboard)/treasury/orders/page.tsx — سفارش‌های خرید/فروش طلا با بازار
"use client";
import { useState } from "react";
import useSWR from "swr";
import { ClipboardList, Plus } from "lucide-react";
import {
  ASSET_FA,
  ActionButton,
  Alert,
  Badge,
  CsvButton,
  Field,
  Modal,
  Num,
  PageHeader,
  Pagination,
  SETTLEMENT_METHOD_FA,
  Spinner,
  TREASURY_STATUS,
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

interface Order {
  id: string;
  orderNumber: string;
  side: "BUY" | "SELL";
  assetType: "MELTED_GOLD" | "BULLION";
  status: string;
  supplierId: string;
  supplierName?: string;
  supplierCode?: string;
  grossWeightGrams: string;
  purityMillesimal: number;
  fineGrams: string;
  barCount: number | null;
  pricePerGramRial: string;
  goldValueRial: string;
  wageRial: string;
  feeRial: string;
  taxRial: string;
  totalRial: string;
  paidRial: string;
  remainingRial: string;
  requestedGrams: string | null;
  supplierInvoiceNo: string | null;
  assayCertificateNo: string | null;
  vaultLocation: string | null;
  note: string | null;
  cancelReason: string | null;
  confirmJournalId: string | null;
  receiveJournalId: string | null;
  cancelJournalId: string | null;
  confirmedAt: string | null;
  receivedAt: string | null;
  createdAt: string;
}
interface OrderDetail extends Order {
  createdBy: string | null;
  confirmedBy: string | null;
  receivedBy: string | null;
  payments: { id: string; paymentNumber: string; direction: string; amountRial: string; method: string; referenceNumber: string | null; paidAt: string; journalEntryId: string | null }[];
}
interface OrderList {
  data: Order[];
  page: number;
  totalPages: number;
  totals: { side: string; grams: string; totalRial: string; paidRial: string }[];
}

const r2t = (v: string | null | undefined) => (v && Number(v) ? String(Math.round(Number(v) / 10)) : "");

function OrderForm({ order, onDone }: { order?: Order; onDone: () => void }) {
  const { data: suppliers } = useSWR<{ data: { id: string; code: string; name: string }[] }>("/api/admin/treasury/suppliers?activeOnly=true&limit=200", fetcher);
  const [f, setF] = useState({
    side: order?.side ?? "BUY",
    assetType: order?.assetType ?? "MELTED_GOLD",
    supplierId: order?.supplierId ?? "",
    grossWeightGrams: order?.grossWeightGrams ?? "",
    purityMillesimal: String(order?.purityMillesimal ?? 750),
    barCount: order?.barCount ? String(order.barCount) : "",
    price: r2t(order?.pricePerGramRial),
    wage: r2t(order?.wageRial),
    fee: r2t(order?.feeRial),
    tax: r2t(order?.taxRial),
    supplierInvoiceNo: order?.supplierInvoiceNo ?? "",
    assayCertificateNo: order?.assayCertificateNo ?? "",
    vaultLocation: order?.vaultLocation ?? "",
    note: order?.note ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const act = useAction();
  const gross = Number(f.grossWeightGrams) || 0;
  const fine = f.assetType === "MELTED_GOLD" ? (gross * Number(f.purityMillesimal)) / 750 : gross;
  const gold = fine * (Number(f.price) || 0);
  const total = gold + (Number(f.wage) || 0) + (Number(f.tax) || 0) + (f.side === "BUY" ? 1 : -1) * (Number(f.fee) || 0);

  const save = async () => {
    const body = {
      side: f.side,
      assetType: f.assetType,
      supplierId: f.supplierId,
      grossWeightGrams: f.grossWeightGrams,
      purityMillesimal: Number(f.purityMillesimal),
      barCount: f.barCount ? Number(f.barCount) : undefined,
      pricePerGramRial: String(tomanToRial(f.price)),
      wageRial: f.wage ? String(tomanToRial(f.wage)) : undefined,
      feeRial: f.fee ? String(tomanToRial(f.fee)) : undefined,
      taxRial: f.tax ? String(tomanToRial(f.tax)) : undefined,
      supplierInvoiceNo: f.supplierInvoiceNo || undefined,
      assayCertificateNo: f.assayCertificateNo || undefined,
      vaultLocation: f.vaultLocation || undefined,
      note: f.note || undefined,
    };
    const ok = await act.run(() => (order ? api.patch(`/api/admin/treasury/orders/${order.id}`, body) : api.post("/api/admin/treasury/orders", body)));
    if (ok) onDone();
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="نوع">
          <select value={f.side} onChange={(e) => set("side", e.target.value)} className={inputCls} disabled={!!order}>
            <option value="BUY">خرید از بازار</option>
            <option value="SELL">فروش به بازار</option>
          </select>
        </Field>
        <Field label="کالا">
          <select
            value={f.assetType}
            onChange={(e) => {
              set("assetType", e.target.value);
              set("purityMillesimal", e.target.value === "BULLION" ? "995" : "750");
            }}
            className={inputCls}
          >
            <option value="MELTED_GOLD">طلای آب‌شده</option>
            <option value="BULLION">شمش</option>
          </select>
        </Field>
        <Field label="طرف معامله">
          <select value={f.supplierId} onChange={(e) => set("supplierId", e.target.value)} className={inputCls}>
            <option value="">انتخاب کنید</option>
            {suppliers?.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="وزن ترازو (گرم)">
          <input value={f.grossWeightGrams} onChange={(e) => set("grossWeightGrams", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="عیار (هزارم)" hint={f.assetType === "MELTED_GOLD" ? "طبق برگه‌ی ری‌گیری؛ مثلاً ۷۴۰" : "۹۹۵ یا ۹۹۹"}>
          <input value={f.purityMillesimal} onChange={(e) => set("purityMillesimal", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        {f.assetType === "BULLION" ? (
          <Field label="تعداد شمش">
            <input value={f.barCount} onChange={(e) => set("barCount", e.target.value)} className={inputCls} dir="ltr" />
          </Field>
        ) : (
          <Field label="معادل ۷۵۰ (گرم)">
            <input value={fine ? fine.toFixed(4) : ""} readOnly className={`${inputCls} bg-gray-50`} dir="ltr" />
          </Field>
        )}
        <Field label={f.assetType === "MELTED_GOLD" ? "قیمت هر گرم ۷۵۰ (تومان)" : "قیمت هر گرم شمش (تومان)"}>
          <input value={f.price} onChange={(e) => set("price", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="اجرت (تومان)">
          <input value={f.wage} onChange={(e) => set("wage", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label={f.side === "BUY" ? "کارمزد (تومان)" : "کارمزد کسرشده (تومان)"}>
          <input value={f.fee} onChange={(e) => set("fee", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="مالیات بر ارزش افزوده (تومان)">
          <input value={f.tax} onChange={(e) => set("tax", e.target.value)} className={inputCls} dir="ltr" />
        </Field>
        <Field label="شماره فاکتور فروشنده">
          <input value={f.supplierInvoiceNo} onChange={(e) => set("supplierInvoiceNo", e.target.value)} className={inputCls} />
        </Field>
        <Field label="شماره برگه ری‌گیری / انگ">
          <input value={f.assayCertificateNo} onChange={(e) => set("assayCertificateNo", e.target.value)} className={inputCls} />
        </Field>
      </div>
      <Field label="محل نگهداری در خزانه">
        <input value={f.vaultLocation} onChange={(e) => set("vaultLocation", e.target.value)} className={inputCls} />
      </Field>
      <Field label="توضیحات">
        <input value={f.note} onChange={(e) => set("note", e.target.value)} className={inputCls} />
      </Field>
      <div className="p-3 rounded-xl bg-gray-50 text-[12px] font-bold">
        ارزش طلا: {gold.toLocaleString("fa-IR", { maximumFractionDigits: 0 })} تومان — {f.side === "BUY" ? "مبلغ کل قابل پرداخت" : "خالص دریافتی"}:{" "}
        {total.toLocaleString("fa-IR", { maximumFractionDigits: 0 })} تومان
      </div>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!f.supplierId || !gross || !Number(f.price)}>
        ذخیره پیش‌نویس
      </ActionButton>
    </div>
  );
}

function PaymentForm({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const [amount, setAmount] = useState(r2t(order.remainingRial));
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [cash, setCash] = useState("1010");
  const [ref, setRef] = useState("");
  const act = useAction();
  const save = async () => {
    const ok = await act.run(() =>
      api.post("/api/admin/treasury/payments", {
        supplierId: order.supplierId,
        orderId: order.id,
        direction: order.side === "BUY" ? "PAY" : "RECEIVE",
        amountRial: String(tomanToRial(amount)),
        method,
        cashAccountCode: cash,
        referenceNumber: ref || undefined,
      }),
    );
    if (ok) onDone();
  };
  return (
    <div className="space-y-2 p-3 rounded-xl border border-gray-100">
      <p className="font-black text-[12px]">{order.side === "BUY" ? "ثبت پرداخت به فروشنده" : "ثبت دریافت از خریدار"}</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="مبلغ (تومان)" className={inputCls} dir="ltr" />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
          {Object.entries(SETTLEMENT_METHOD_FA).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input value={cash} onChange={(e) => setCash(e.target.value)} placeholder="حساب بانک (1010...)" className={inputCls} dir="ltr" />
        <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="شماره پیگیری" className={inputCls} />
      </div>
      {act.error && <Alert kind="error" text={act.error} />}
      <ActionButton onClick={save} busy={act.busy} disabled={!Number(amount)}>
        ثبت
      </ActionButton>
    </div>
  );
}

function OrderDetailView({ id, onChanged, onEdit }: { id: string; onChanged: () => void; onEdit: (o: Order) => void }) {
  const can = usePerm();
  const { data, mutate } = useSWR<OrderDetail>(`/api/admin/treasury/orders/${id}`, fetcher);
  const act = useAction();
  const [journal, setJournal] = useState<string | null>(null);
  const [vaultLocation, setVaultLocation] = useState("");
  if (!data) return <Spinner />;
  const refresh = () => {
    void mutate();
    onChanged();
  };
  const manage = can("treasury.order.manage");
  const rows: [string, React.ReactNode][] = [
    ["نوع", `${data.side === "BUY" ? "خرید از بازار" : "فروش به بازار"} — ${ASSET_FA[data.assetType]}`],
    ["طرف معامله", `${data.supplierName ?? ""} (${data.supplierCode ?? ""})`],
    ["وزن ترازو / عیار", `${grams(data.grossWeightGrams)} گرم / ${data.purityMillesimal.toLocaleString("fa-IR")}`],
    ["وزن مبنا", `${grams(data.fineGrams)} گرم${data.assetType === "MELTED_GOLD" ? " (۷۵۰)" : ""}`],
    ["قیمت هر گرم", `${toman(data.pricePerGramRial)} تومان`],
    ["ارزش طلا / اجرت / کارمزد / مالیات", `${toman(data.goldValueRial)} / ${toman(data.wageRial)} / ${toman(data.feeRial)} / ${toman(data.taxRial)}`],
    ["مبلغ کل", `${toman(data.totalRial)} تومان`],
    ["پرداخت‌شده / مانده", `${toman(data.paidRial)} / ${toman(data.remainingRial)} تومان`],
    ["فاکتور فروشنده / ری‌گیری", `${data.supplierInvoiceNo ?? "—"} / ${data.assayCertificateNo ?? "—"}`],
    ["محل نگهداری", data.vaultLocation ?? "—"],
    ["ثبت", `${data.createdBy ?? ""} — ${faDateTime(data.createdAt)}`],
    ["قطعی", data.confirmedAt ? `${data.confirmedBy ?? ""} — ${faDateTime(data.confirmedAt)}` : "—"],
    ["تحویل", data.receivedAt ? `${data.receivedBy ?? ""} — ${faDateTime(data.receivedAt)}` : "—"],
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge map={TREASURY_STATUS} value={data.status} />
        {data.requestedGrams && <span className="text-[11px] text-gray-500">پیشنهاد گزارش پوشش: {grams(data.requestedGrams)} گرم</span>}
      </div>
      <Table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="text-gray-500 w-44">{k}</td>
              <td className="font-bold">{v}</td>
            </tr>
          ))}
        </tbody>
      </Table>
      {data.note && <p className="text-[12px] whitespace-pre-line text-gray-600">{data.note}</p>}
      {data.cancelReason && <Alert kind="error" text={`ابطال: ${data.cancelReason}`} />}
      <div className="flex flex-wrap gap-2 text-[11px]">
        {[data.confirmJournalId, data.receiveJournalId, data.cancelJournalId]
          .filter(Boolean)
          .map((j, i) => (
            <button key={j} type="button" onClick={() => setJournal(j)} className="font-bold text-blue-700">
              {["سند قطعی", "سند رسید خزانه", "سند ابطال"][i]}
            </button>
          ))}
      </div>
      {act.error && <Alert kind="error" text={act.error} />}
      {act.success && <Alert kind="success" text={act.success} />}
      {manage && (
        <div className="flex flex-wrap gap-2">
          {data.status === "DRAFT" && (
            <>
              <ActionButton onClick={() => onEdit(data)} variant="secondary">
                ویرایش
              </ActionButton>
              <ActionButton
                busy={act.busy}
                onClick={() =>
                  void act
                    .run(
                      () => api.post(`/api/admin/treasury/orders/${id}/confirm`),
                      data.side === "BUY"
                        ? `خرید ${grams(data.fineGrams)} گرم به مبلغ ${toman(data.totalRial)} تومان قطعی شود؟ (قیمت قفل و بدهی به فروشنده ثبت می‌شود)`
                        : `فروش ${grams(data.fineGrams)} گرم و خروج آن از خزانه ثبت شود؟`,
                    )
                    .then(refresh)
                }
              >
                {data.side === "BUY" ? "قطعی کردن خرید" : "ثبت فروش و تحویل"}
              </ActionButton>
            </>
          )}
          {data.status === "CONFIRMED" && data.side === "BUY" && (
            <div className="flex flex-wrap items-end gap-2">
              <input value={vaultLocation} onChange={(e) => setVaultLocation(e.target.value)} placeholder="محل نگهداری" className={inputCls} />
              <ActionButton
                busy={act.busy}
                onClick={() =>
                  void act
                    .run(
                      () => api.post(`/api/admin/treasury/orders/${id}/receive`, { vaultLocation: vaultLocation || undefined }),
                      `رسید ورود ${grams(data.fineGrams)} گرم به خزانه ثبت شود؟ (پس از توزین و ری‌گیری)`,
                    )
                    .then(refresh)
                }
              >
                ثبت رسید ورود به خزانه
              </ActionButton>
            </div>
          )}
          {(data.status === "DRAFT" || data.status === "CONFIRMED") && (
            <ActionButton
              variant="danger"
              busy={act.busy}
              onClick={() => {
                const reason = window.prompt("دلیل ابطال سفارش:");
                if (reason) void act.run(() => api.post(`/api/admin/treasury/orders/${id}/cancel`, { reason })).then(refresh);
              }}
            >
              ابطال
            </ActionButton>
          )}
        </div>
      )}
      {can("treasury.payment.manage") && data.status !== "DRAFT" && data.status !== "CANCELLED" && Number(data.remainingRial) > 0 && (
        <PaymentForm order={data} onDone={refresh} />
      )}
      {data.payments.length > 0 && (
        <Table>
          <thead>
            <tr>
              <th>شماره</th>
              <th>مبلغ (تومان)</th>
              <th>روش</th>
              <th>پیگیری</th>
              <th>تاریخ</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td>{p.paymentNumber}</td>
                <Num>{toman(p.amountRial)}</Num>
                <td>{SETTLEMENT_METHOD_FA[p.method]}</td>
                <td>{p.referenceNumber ?? "—"}</td>
                <td>{faDate(p.paidAt)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {journal && <JournalModal id={journal} onClose={() => setJournal(null)} />}
    </div>
  );
}

export default function TreasuryOrdersPage() {
  const can = usePerm();
  const [status, setStatus] = useState("");
  const [side, setSide] = useState("");
  const [assetType, setAssetType] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<string | null>(null);
  const [form, setForm] = useState<{ order?: Order } | null>(null);
  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set("status", status);
  if (side) qs.set("side", side);
  if (assetType) qs.set("assetType", assetType);
  const { data, isLoading, mutate } = useSWR<OrderList>(`/api/admin/treasury/orders?${qs}`, fetcher);
  const sel = "px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white";

  const exportCsv = () =>
    data &&
    downloadCsv(
      "treasury-orders.csv",
      ["شماره", "نوع", "کالا", "طرف معامله", "وزن مبنا", "قیمت هر گرم (ریال)", "مبلغ کل (ریال)", "پرداخت‌شده (ریال)", "وضعیت", "فاکتور فروشنده", "ری‌گیری", "تاریخ ثبت"],
      data.data.map((o) => [
        o.orderNumber,
        o.side === "BUY" ? "خرید" : "فروش",
        ASSET_FA[o.assetType],
        o.supplierName,
        o.fineGrams,
        o.pricePerGramRial,
        o.totalRial,
        o.paidRial,
        TREASURY_STATUS[o.status]?.label,
        o.supplierInvoiceNo,
        o.assayCertificateNo,
        faDate(o.createdAt),
      ]),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ClipboardList}
        title="سفارش‌های خرید و فروش خزانه"
        subtitle="چرخه‌ی خرید استاندارد: درخواست (پیش‌نویس) ← قطعی‌سازی با قیمت نهایی (تعهد به فروشنده) ← توزین/ری‌گیری و رسید ورود به خزانه ← پرداخت. فروش مازاد خزانه هم از همین‌جا ثبت می‌شود."
        actions={
          <>
            <CsvButton onClick={exportCsv} />
            {can("treasury.order.manage") && (
              <ActionButton onClick={() => setForm({})}>
                <Plus className="w-4 h-4" /> سفارش جدید
              </ActionButton>
            )}
          </>
        }
      />
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <div className="flex flex-wrap gap-2">
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className={sel}>
            <option value="">همه‌ی وضعیت‌ها</option>
            {Object.entries(TREASURY_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={side} onChange={(e) => { setSide(e.target.value); setPage(1); }} className={sel}>
            <option value="">خرید و فروش</option>
            <option value="BUY">خرید</option>
            <option value="SELL">فروش</option>
          </select>
          <select value={assetType} onChange={(e) => { setAssetType(e.target.value); setPage(1); }} className={sel}>
            <option value="">همه‌ی کالاها</option>
            <option value="MELTED_GOLD">طلای آب‌شده</option>
            <option value="BULLION">شمش</option>
          </select>
        </div>
        {data?.totals.length ? (
          <p className="text-[12px] text-gray-500">
            {data.totals
              .map((t) => `${t.side === "BUY" ? "خرید" : "فروش"} قطعی: ${grams(t.grams)} گرم — ${toman(t.totalRial)} تومان (پرداخت/دریافت ${toman(t.paidRial)})`)
              .join(" | ")}
          </p>
        ) : null}
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>شماره</th>
                  <th>نوع</th>
                  <th>طرف معامله</th>
                  <th>وزن مبنا (گرم)</th>
                  <th>قیمت هر گرم</th>
                  <th>مبلغ کل (تومان)</th>
                  <th>مانده پرداخت</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setView(o.id)}>
                    <Num bold>{o.orderNumber}</Num>
                    <td>
                      {o.side === "BUY" ? "خرید" : "فروش"} {ASSET_FA[o.assetType]}
                    </td>
                    <td>{o.supplierName}</td>
                    <Num>{grams(o.fineGrams)}</Num>
                    <Num>{toman(o.pricePerGramRial)}</Num>
                    <Num bold>{toman(o.totalRial)}</Num>
                    <Num>{Number(o.remainingRial) ? toman(o.remainingRial) : "—"}</Num>
                    <td>
                      <Badge map={TREASURY_STATUS} value={o.status} />
                    </td>
                    <td>{faDate(o.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )}
      </div>
      {view && (
        <Modal title="جزئیات سفارش خزانه" onClose={() => setView(null)} wide>
          <OrderDetailView
            id={view}
            onChanged={() => void mutate()}
            onEdit={(o) => {
              setView(null);
              setForm({ order: o });
            }}
          />
        </Modal>
      )}
      {form && (
        <Modal title={form.order ? `ویرایش ${form.order.orderNumber}` : "سفارش جدید خزانه"} onClose={() => setForm(null)} wide>
          <OrderForm
            order={form.order}
            onDone={() => {
              setForm(null);
              void mutate();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
