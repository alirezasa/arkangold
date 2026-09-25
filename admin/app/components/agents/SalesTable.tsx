// admin/app/components/agents/SalesTable.tsx
//
// فهرست فروش‌های نماینده — مشترک بین پنل مدیریت (همه/یک نماینده) و پرتال نماینده.
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Search, FileText, Eye, Ban, Loader2, Download, RefreshCcw } from "lucide-react";
import {
  Alert,
  Badge,
  Empty,
  Field,
  Modal,
  Pagination,
  PURITY_FA,
  SALE_PAYMENT_FA,
  SALE_STATUS,
  Spinner,
  downloadCsv,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
} from "./ui";

export interface SaleRow {
  id: string;
  saleNumber: string;
  status: string;
  agent: { id: string; code: string; name: string };
  hologramCode: { code: string };
  buyerFullName: string;
  buyerPhone: string;
  buyerNationalCode: string;
  buyerAccountCreated: boolean;
  identityVerified: boolean;
  weightGrams: string;
  purityKarat: string;
  goldPricePerGramRial: string;
  goldValueRial: string;
  premiumRial: string;
  totalRial: string;
  commissionRial: string;
  netPayableRial: string;
  paymentMethod: string;
  paymentReference: string | null;
  invoiceId: string | null;
  journalEntryId: string | null;
  soldByAdmin: { fullName: string };
  createdAt: string;
}

interface SalesResponse {
  data: SaleRow[];
  total: number;
  totalPages: number;
  totals: { completedCount: number; totalRial: string; commissionRial: string; netPayableRial: string; grams: string };
}

export default function SalesTable({
  listEndpoint,
  detailEndpoint,
  invoiceIssueEndpoint,
  showAgent = false,
  canVoid = false,
  invoiceScope,
  agentId,
}: {
  /** مثلاً /api/admin/agents/sales یا /api/agent-portal/sales */
  listEndpoint: string;
  detailEndpoint: (id: string) => string;
  invoiceIssueEndpoint: (id: string) => string;
  showAgent?: boolean;
  canVoid?: boolean;
  invoiceScope: "admin" | "agent";
  agentId?: string;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [voiding, setVoiding] = useState<SaleRow | null>(null);

  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (query) qs.set("search", query);
  if (status) qs.set("status", status);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (agentId) qs.set("agentId", agentId);
  const { data, isLoading, mutate } = useSWR<SalesResponse>(`${listEndpoint}?${qs.toString()}`, fetcher);

  const exportCsv = async () => {
    const all = new URLSearchParams(qs);
    all.set("page", "1");
    all.set("limit", "200");
    const res = await axios.get<SalesResponse>(`${listEndpoint}?${all.toString()}`);
    downloadCsv(
      `agent-sales-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        "شماره فروش",
        "تاریخ",
        "نماینده",
        "کد هولوگرام",
        "وزن (گرم)",
        "عیار",
        "خریدار",
        "موبایل خریدار",
        "کد ملی",
        "نرخ هر گرم (ریال)",
        "ارزش طلا (ریال)",
        "اجرت (ریال)",
        "مبلغ فروش (ریال)",
        "حق‌العمل (ریال)",
        "سهم شرکت (ریال)",
        "روش پرداخت",
        "وضعیت",
      ],
      res.data.data.map((s) => [
        s.saleNumber,
        new Date(s.createdAt).toLocaleString("fa-IR"),
        `${s.agent.name} (${s.agent.code})`,
        s.hologramCode.code,
        s.weightGrams,
        s.purityKarat,
        s.buyerFullName,
        s.buyerPhone,
        s.buyerNationalCode,
        s.goldPricePerGramRial,
        s.goldValueRial,
        s.premiumRial,
        s.totalRial,
        s.commissionRial,
        s.netPayableRial,
        SALE_PAYMENT_FA[s.paymentMethod] ?? s.paymentMethod,
        SALE_STATUS[s.status]?.label ?? s.status,
      ]),
    );
  };

  return (
    <div className="space-y-4">
      <form
        className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto_auto] items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          setQuery(search.trim());
        }}
      >
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="شماره فروش، کد هولوگرام، نام/موبایل/کد ملی خریدار"
            className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-gold-500 text-sm"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white"
        >
          <option value="">همه فروش‌ها</option>
          <option value="COMPLETED">قطعی</option>
          <option value="VOIDED">ابطال‌شده</option>
        </select>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
          dir="ltr"
          title="از تاریخ"
        />
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white"
          dir="ltr"
          title="تا تاریخ"
        />
        <div className="flex gap-2">
          <button type="submit" className={primaryBtn} style={primaryBtnStyle}>
            <Search className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => void exportCsv()} className={secondaryBtn} title="خروجی اکسل (CSV)">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </form>

      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[12px]">
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-gray-400">فروش قطعی</p>
            <p className="font-black text-gray-800">
              {faNum(data.totals.completedCount)} شمش · {faNum(data.totals.grams)} گرم
            </p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-gray-400">مبلغ کل فروش</p>
            <p className="font-black text-gray-800">{toman(data.totals.totalRial)} تومان</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-gray-400">حق‌العمل نماینده</p>
            <p className="font-black text-amber-700">{toman(data.totals.commissionRial)} تومان</p>
          </div>
          <div className="rounded-xl bg-gray-50 p-3">
            <p className="text-gray-400">سهم شرکت (قابل تسویه)</p>
            <p className="font-black" style={{ color: "var(--color-emerald)" }}>
              {toman(data.totals.netPayableRial)} تومان
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <Spinner />
      ) : !data?.data.length ? (
        <Empty text="فروشی ثبت نشده است" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[960px]">
            <thead>
              <tr>
                <th>شماره / تاریخ</th>
                {showAgent && <th>نماینده</th>}
                <th>شمش</th>
                <th>خریدار (مالک نهایی)</th>
                <th>مبلغ فروش</th>
                <th>حق‌العمل</th>
                <th>سهم شرکت</th>
                <th>وضعیت</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <p className="font-bold text-gray-800" dir="ltr">
                      {s.saleNumber}
                    </p>
                    <p className="text-[11px] text-gray-400">{faDateTime(s.createdAt)}</p>
                  </td>
                  {showAgent && (
                    <td className="text-[12px]">
                      {s.agent.name}
                      <p className="text-[10px] text-gray-400" dir="ltr">
                        {s.agent.code}
                      </p>
                    </td>
                  )}
                  <td>
                    <p className="font-mono font-bold">{s.hologramCode.code}</p>
                    <p className="text-[11px] text-gray-400">
                      {faNum(s.weightGrams)} گرم · {PURITY_FA[s.purityKarat] ?? s.purityKarat}
                    </p>
                  </td>
                  <td>
                    <p className="font-bold text-gray-800">{s.buyerFullName}</p>
                    <p className="text-[11px] text-gray-400" dir="ltr">
                      {s.buyerPhone}
                    </p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {s.identityVerified && <span className="badge bg-green-50 text-green-700">احراز ثبت احوال</span>}
                      {s.buyerAccountCreated && <span className="badge bg-blue-50 text-blue-700">حساب جدید</span>}
                    </div>
                  </td>
                  <td className="font-bold">{toman(s.totalRial)}</td>
                  <td className="text-amber-700">{toman(s.commissionRial)}</td>
                  <td className="font-black" style={{ color: "var(--color-emerald)" }}>
                    {toman(s.netPayableRial)}
                  </td>
                  <td>
                    <Badge map={SALE_STATUS} value={s.status} />
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setSelected(s)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                        title="جزئیات"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {s.invoiceId && (
                        <a
                          href={`/invoices/${s.invoiceId}/print${invoiceScope === "agent" ? "?scope=agent" : ""}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                          title="فاکتور مشتری"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                      )}
                      {canVoid && s.status === "COMPLETED" && (
                        <button
                          type="button"
                          onClick={() => setVoiding(s)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-600"
                          title="ابطال فروش"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400">مبالغ به تومان است.</p>
      {data && <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />}

      {selected && (
        <SaleDetailModal
          saleId={selected.id}
          detailEndpoint={detailEndpoint}
          invoiceIssueEndpoint={invoiceIssueEndpoint}
          invoiceScope={invoiceScope}
          onClose={() => setSelected(null)}
          onChanged={() => void mutate()}
        />
      )}
      {voiding && (
        <VoidSaleModal
          sale={voiding}
          onClose={() => setVoiding(null)}
          onDone={async () => {
            setVoiding(null);
            await mutate();
          }}
        />
      )}
    </div>
  );
}

// ─────────────────────────── جزئیات فروش ───────────────────────────

interface SaleDetail extends SaleRow {
  paymentMethodLabel: string;
  note: string | null;
  voidReason: string | null;
  voidedAt: string | null;
  voidedByAdmin: { fullName: string } | null;
  identityVerificationRef: string | null;
  hologramCode: {
    code: string;
    status: string;
    factorySerialNumber: string | null;
    mintedAt: string | null;
    product: { name: string } | null;
    batch: { batchNumber: string };
  };
  soldByAdmin: { fullName: string; username?: string };
}

export function SaleDetailModal({
  saleId,
  detailEndpoint,
  invoiceIssueEndpoint,
  invoiceScope,
  onClose,
  onChanged,
}: {
  saleId: string;
  detailEndpoint: (id: string) => string;
  invoiceIssueEndpoint: (id: string) => string;
  invoiceScope: "admin" | "agent";
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { data: s, mutate } = useSWR<SaleDetail>(detailEndpoint(saleId), fetcher);
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issue = async () => {
    setIssuing(true);
    setError(null);
    try {
      await axios.post(invoiceIssueEndpoint(saleId));
      await mutate();
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err, "صدور فاکتور ممکن نشد"));
    } finally {
      setIssuing(false);
    }
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1.5 border-b border-gray-50 text-[12px]">
      <span className="text-gray-400">{label}</span>
      <span className="font-bold text-gray-800 text-left">{value}</span>
    </div>
  );

  return (
    <Modal title={s ? `فروش ${s.saleNumber}` : "جزئیات فروش"} onClose={onClose} wide>
      {!s ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {error && <Alert kind="error" text={error} />}
          {s.status === "VOIDED" && (
            <Alert
              kind="error"
              text={`این فروش در ${faDateTime(s.voidedAt)} توسط ${s.voidedByAdmin?.fullName ?? "—"} ابطال شد.\nدلیل: ${s.voidReason ?? "—"}`}
            />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[12px] font-black text-gray-700 mb-1">شمش</p>
              {row("کد هولوگرام", <span className="font-mono">{s.hologramCode.code}</span>)}
              {row("محصول", s.hologramCode.product?.name ?? "شمش طلا")}
              {row("وزن / عیار", `${faNum(s.weightGrams)} گرم · ${PURITY_FA[s.purityKarat] ?? s.purityKarat}`)}
              {row("سریال کارخانه", s.hologramCode.factorySerialNumber ?? "—")}
              {row("دسته هولوگرام", <span dir="ltr">{s.hologramCode.batch.batchNumber}</span>)}
            </div>
            <div>
              <p className="text-[12px] font-black text-gray-700 mb-1">خریدار (مالک نهایی)</p>
              {row("نام", s.buyerFullName)}
              {row("کد ملی", <span dir="ltr">{s.buyerNationalCode}</span>)}
              {row("موبایل (نام کاربری پنل)", <span dir="ltr">{s.buyerPhone}</span>)}
              {row("احراز هویت ثبت احوال", s.identityVerified ? "انجام شد" : "انجام نشده")}
              {row("حساب کاربری", s.buyerAccountCreated ? "در همین فروش ایجاد شد" : "از قبل وجود داشت")}
            </div>
          </div>
          <div>
            <p className="text-[12px] font-black text-gray-700 mb-1">محاسبه مبلغ (تومان)</p>
            {row("نرخ هر گرم در لحظه فروش", toman(s.goldPricePerGramRial))}
            {row("ارزش طلا (وزن × نرخ)", toman(s.goldValueRial))}
            {row("اجرت / حق ضرب", toman(s.premiumRial))}
            {row("مبلغ کل فروش به مشتری", <span className="text-[14px]">{toman(s.totalRial)}</span>)}
            {row("حق‌العمل نماینده", <span className="text-amber-700">− {toman(s.commissionRial)}</span>)}
            {row(
              "سهم شرکت (بدهی نماینده)",
              <span style={{ color: "var(--color-emerald)" }}>{toman(s.netPayableRial)}</span>,
            )}
            {row("روش دریافت از مشتری", `${s.paymentMethodLabel}${s.paymentReference ? ` — مرجع ${s.paymentReference}` : ""}`)}
            {row("ثبت‌کننده", s.soldByAdmin.fullName)}
            {row("زمان ثبت", faDateTime(s.createdAt))}
            {s.note && row("یادداشت", s.note)}
            {s.journalEntryId && row("شناسه سند حسابداری", <span className="font-mono text-[10px]">{s.journalEntryId}</span>)}
          </div>
          <div className="flex gap-2 flex-wrap">
            {s.invoiceId ? (
              <a
                href={`/invoices/${s.invoiceId}/print${invoiceScope === "agent" ? "?scope=agent" : ""}`}
                target="_blank"
                rel="noreferrer"
                className={primaryBtn}
                style={primaryBtnStyle}
              >
                <FileText className="w-4 h-4" /> مشاهده و چاپ فاکتور مشتری
              </a>
            ) : (
              s.status === "COMPLETED" && (
                <button type="button" onClick={() => void issue()} disabled={issuing} className={primaryBtn} style={primaryBtnStyle}>
                  {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  صدور فاکتور
                </button>
              )
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─────────────────────────── ابطال فروش ───────────────────────────

function VoidSaleModal({ sale, onClose, onDone }: { sale: SaleRow; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason.trim().length < 10) return setError("دلیل ابطال باید حداقل ۱۰ کاراکتر باشد");
    setBusy(true);
    setError(null);
    try {
      await axios.post(`/api/admin/agents/sales/${sale.id}/void`, { reason: reason.trim() });
      await onDone();
    } catch (err) {
      setError(getErrorMessage(err, "ابطال فروش ممکن نشد"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`ابطال فروش ${sale.saleNumber}`} onClose={onClose}>
      <Alert
        kind="warn"
        text={`با ابطال: مالکیت شمش ${sale.hologramCode.code} از ${sale.buyerFullName} برداشته می‌شود، شمش به موجودی امانی نماینده برمی‌گردد، سند حسابداری معکوس ثبت و ${toman(sale.netPayableRial)} تومان از بدهی نماینده کسر می‌شود و فاکتور مشتری باطل می‌گردد.\nاگر مالک شمش را به فرد دیگری منتقل کرده باشد ابطال ممکن نیست.`}
      />
      {error && <Alert kind="error" text={error} />}
      <Field label="دلیل ابطال (در صورتحساب نماینده و فاکتور درج می‌شود)">
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} />
      </Field>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-white bg-red-600 disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Ban className="w-4 h-4" />}
        تأیید ابطال فروش
      </button>
    </Modal>
  );
}
