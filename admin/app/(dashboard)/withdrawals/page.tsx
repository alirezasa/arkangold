// admin/app/(dashboard)/withdrawals/page.tsx
//
// درخواست‌های برداشت ریالی: بررسی و تأیید ← صف پرداخت بانکی ← ثبت پرداخت (شماره پیگیری، حساب
// مبدأ، روش پرداخت) با صدور خودکار سند حسابداری؛ رد، برگشت وجه از بانک، پرداخت گروهی و خروجی فایل بانک.
"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Banknote, CheckCircle2, Download, FileText, RotateCcw, Search, Wallet, XCircle } from "lucide-react";
import JalaliDateInput from "@/app/components/JalaliDateInput";
import { todayIsoLocal } from "@/app/utils/jalali";
import {
  AccountSelect,
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
  Table,
  api,
  cardStyle,
  downloadCsv,
  faDateTime,
  fetcher,
  inputCls,
  toman,
  useAction,
  usePerm,
} from "@/app/components/finance/ui";

type WStatus = "PENDING" | "APPROVED" | "PROCESSED" | "REJECTED" | "CANCELLED" | "RETURNED";

interface Row {
  id: string;
  requestNumber: string | null;
  status: WStatus;
  statusLabel: string;
  amountRial: string;
  feeRial: string;
  netAmountRial: string;
  rejectionReason: string | null;
  bankReference: string | null;
  payoutMethod: string | null;
  payoutBatchId: string | null;
  sourceAccountCode: string | null;
  user: { id: string; phone: string; fullName: string | null; nationalCode: string | null };
  bankAccount: { bankName: string; cardNumber: string; sheba: string | null; accountNumber: string | null; isVerified: boolean };
  createdAt: string;
  reviewedAt: string | null;
  paidAt: string | null;
  returnedAt: string | null;
  returnReason: string | null;
}
interface ListResp {
  data: Row[];
  statusSummary: Record<string, { count: number; amountRial: string }>;
  totals: { amountRial: string; feeRial: string; netAmountRial: string };
  page: number;
  totalPages: number;
  total: number;
}
interface Detail extends Row {
  user: Row["user"] & { status: string; identityStatus: string | null; memberSince: string; walletRialBalance: string; heldRial: string };
  history: { paidCount: number; paidAmountRial: string; rejectedCount: number };
  approvals: { id: string; status: string; step: number; comment: string | null; approver: string; createdAt: string }[];
  journal: { id: string; referenceNumber: number; permanentNumber: number | null; entryDate: string } | null;
  smsLogs: { id: string; templateKey: string | null; status: string; createdAt: string }[];
}

const W_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "در انتظار بررسی", cls: "bg-amber-50 text-amber-700" },
  APPROVED: { label: "صف پرداخت", cls: "bg-blue-50 text-blue-700" },
  PROCESSED: { label: "پرداخت‌شده", cls: "bg-green-50 text-green-700" },
  REJECTED: { label: "ردشده", cls: "bg-red-50 text-red-600" },
  CANCELLED: { label: "لغو کاربر", cls: "bg-gray-100 text-gray-500" },
  RETURNED: { label: "برگشت از بانک", cls: "bg-purple-50 text-purple-700" },
};

const PAYOUT_FA: Record<string, string> = {
  PAYA: "پایا",
  SATNA: "ساتنا",
  POL: "پل",
  CARD_TO_CARD: "کارت به کارت",
  INTERNAL: "انتقال داخلی بانک",
};

const TABS: { key: WStatus | ""; label: string }[] = [
  { key: "PENDING", label: "در انتظار بررسی" },
  { key: "APPROVED", label: "صف پرداخت بانکی" },
  { key: "PROCESSED", label: "پرداخت‌شده" },
  { key: "REJECTED", label: "ردشده" },
  { key: "RETURNED", label: "برگشتی" },
  { key: "CANCELLED", label: "لغو کاربر" },
  { key: "", label: "همه" },
];

export default function WithdrawalsPage() {
  const [status, setStatus] = useState<WStatus | "">("PENDING");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const can = usePerm();

  const qs = new URLSearchParams({ page: String(page), limit: "50" });
  if (status) qs.set("status", status);
  if (search) qs.set("q", search);
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading, mutate } = useSWR<ListResp>(`/api/admin/withdrawals?${qs.toString()}`, fetcher);

  const rows = data?.data ?? [];
  const selectable = status === "APPROVED";
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectedRows = rows.filter((r) => selected.has(r.id));

  const exportBankFile = () => {
    const list = selectedRows.length ? selectedRows : rows;
    downloadCsv(
      `withdrawals-${status || "all"}-${todayIsoLocal()}.csv`,
      ["ردیف", "شماره درخواست", "نام صاحب حساب", "کد ملی", "شبا", "شماره کارت", "بانک", "مبلغ خالص (ریال)", "کارمزد (ریال)", "مبلغ درخواست (ریال)", "شرح"],
      list.map((r, i) => [
        i + 1,
        r.requestNumber,
        r.user.fullName,
        r.user.nationalCode,
        r.bankAccount.sheba,
        r.bankAccount.cardNumber,
        r.bankAccount.bankName,
        r.netAmountRial,
        r.feeRial,
        r.amountRial,
        `برداشت ${r.requestNumber ?? ""}`,
      ]),
    );
  };

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={Wallet}
        title="درخواست‌های برداشت"
        subtitle="بررسی و تأیید ← پرداخت بانکی با ثبت شماره پیگیری و حساب مبدأ (سند حسابداری خودکار: بدهی کاربران / بانک / درآمد کارمزد) ← پیامک به کاربر. پرداخت گروهی با خروجی فایل بانک ممکن است."
        actions={
          <Link href="/finance-report" className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-bold border-2 border-gray-200 bg-white text-gray-700">
            <FileText className="w-4 h-4" /> گزارش واریز و برداشت
          </Link>
        }
      />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const sum = t.key ? data?.statusSummary?.[t.key] : null;
          return (
            <button
              key={t.key || "all"}
              type="button"
              onClick={() => {
                setStatus(t.key);
                setPage(1);
                setSelected(new Set());
              }}
              className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold border ${status === t.key ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-600"}`}
              style={status === t.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
            >
              {t.label}
              {sum ? ` (${sum.count.toLocaleString("fa-IR")})` : ""}
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
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
                placeholder="شماره درخواست، موبایل، کد ملی، شبا، پیگیری"
                className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white w-64"
              />
            </label>
            <button type="submit" className="px-3 py-2 rounded-xl border border-gray-200 bg-white">
              <Search className="w-4 h-4" />
            </button>
          </form>
        </DateRange>
        {data && (
          <div className="flex flex-wrap gap-4 text-[12px] text-gray-600">
            <span>
              تعداد: <b>{data.total.toLocaleString("fa-IR")}</b>
            </span>
            <span>
              جمع مبلغ: <b>{toman(data.totals.amountRial)}</b> تومان
            </span>
            <span>
              کارمزد: <b>{toman(data.totals.feeRial)}</b> تومان
            </span>
            <span>
              خالص قابل پرداخت: <b>{toman(data.totals.netAmountRial)}</b> تومان
            </span>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary" onClick={exportBankFile} disabled={!rows.length}>
            <Download className="w-4 h-4" /> {selectedRows.length ? `خروجی فایل بانک (${selectedRows.length.toLocaleString("fa-IR")} مورد)` : "خروجی اکسل این صفحه"}
          </ActionButton>
          {selectable && can("withdrawal.pay") && (
            <ActionButton disabled={!selectedRows.length} onClick={() => setBatchOpen(true)}>
              <Banknote className="w-4 h-4" /> ثبت پرداخت گروهی ({selectedRows.length.toLocaleString("fa-IR")})
            </ActionButton>
          )}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        {isLoading || !data ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <Empty text="درخواستی یافت نشد" />
        ) : (
          <Table>
            <thead>
              <tr>
                {selectable && (
                  <th>
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selected.size === rows.length}
                      onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                    />
                  </th>
                )}
                <th>شماره</th>
                <th>کاربر</th>
                <th>مقصد</th>
                <th>مبلغ (تومان)</th>
                <th>کارمزد</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  {selectable && (
                    <td>
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    </td>
                  )}
                  <td dir="ltr" className="whitespace-nowrap">
                    {r.requestNumber}
                  </td>
                  <td>
                    <p className="font-bold">{r.user.fullName ?? "—"}</p>
                    <p className="text-[10px] text-gray-400" dir="ltr">
                      {r.user.phone}
                    </p>
                  </td>
                  <td>
                    <p>{r.bankAccount.bankName}</p>
                    <p className="text-[10px] text-gray-400" dir="ltr">
                      {r.bankAccount.sheba ?? r.bankAccount.cardNumber}
                    </p>
                  </td>
                  <td className="font-black whitespace-nowrap">{toman(r.amountRial)}</td>
                  <td className="whitespace-nowrap">{Number(r.feeRial) ? toman(r.feeRial) : "—"}</td>
                  <td>
                    <Badge map={W_STATUS} value={r.status} />
                    {r.bankReference && (
                      <p className="text-[10px] text-gray-400 mt-0.5" dir="ltr">
                        {r.bankReference}
                      </p>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-[11px]">{faDateTime(r.createdAt)}</td>
                  <td>
                    <button type="button" onClick={() => setOpenId(r.id)} className="text-emerald-700 font-bold text-[12px]">
                      بررسی
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
      </div>

      {openId && (
        <DetailModal
          id={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => void mutate()}
        />
      )}
      {batchOpen && (
        <BatchPayModal
          rows={selectedRows}
          onClose={() => setBatchOpen(false)}
          onDone={() => {
            setSelected(new Set());
            void mutate();
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════ جزئیات و اقدامات ═══════════════════════════

function DetailModal({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { data: d, mutate } = useSWR<Detail>(`/api/admin/withdrawals/${id}`, fetcher);
  const can = usePerm();
  const act = useAction();
  const [mode, setMode] = useState<"none" | "reject" | "pay" | "return">("none");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const done = () => {
    void mutate();
    onChanged();
    setMode("none");
    setReason("");
  };

  return (
    <Modal title={d ? `برداشت ${d.requestNumber ?? ""}` : "برداشت"} onClose={onClose} wide>
      {!d ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge map={W_STATUS} value={d.status} />
            <span className="text-gray-500">{faDateTime(d.createdAt)}</span>
          </div>
          {act.error && <Alert kind="error" text={act.error} />}
          {act.success && <Alert kind="success" text={act.success} />}

          <div className="grid gap-3 md:grid-cols-3">
            <Box title="مبلغ">
              <p className="text-[18px] font-black">{toman(d.amountRial)} تومان</p>
              <p className="text-gray-500 text-[12px]">کارمزد: {toman(d.feeRial)} — خالص واریزی: {toman(d.netAmountRial)}</p>
            </Box>
            <Box title="کاربر">
              <p className="font-bold">{d.user.fullName ?? "—"}</p>
              <p className="text-[12px] text-gray-500">
                <span dir="ltr">{d.user.phone}</span> — کد ملی {d.user.nationalCode ?? "—"}
              </p>
              <p className="text-[12px] text-gray-500">
                احراز هویت: {d.user.identityStatus === "VERIFIED" ? "تأییدشده" : d.user.identityStatus ?? "—"}
              </p>
              <Link href={`/users/${d.user.id}`} className="text-[11px] text-emerald-700 font-bold">
                پرونده کاربر ←
              </Link>
            </Box>
            <Box title="کیف پول">
              <p className="text-[12px]">موجودی: {toman(d.user.walletRialBalance)} تومان</p>
              <p className="text-[12px]">رزرو فعال: {toman(d.user.heldRial)} تومان</p>
              <p className="text-[12px] text-gray-500">
                برداشت‌های قبلی: {d.history.paidCount.toLocaleString("fa-IR")} مورد ({toman(d.history.paidAmountRial)} تومان) — رد:{" "}
                {d.history.rejectedCount.toLocaleString("fa-IR")}
              </p>
            </Box>
          </div>

          <Box title="حساب مقصد">
            <div className="grid gap-1 md:grid-cols-2 text-[12px]">
              <p>بانک: {d.bankAccount.bankName}</p>
              <p>
                شبا: <span dir="ltr" className="font-bold">{d.bankAccount.sheba ?? "—"}</span>
              </p>
              <p>
                کارت: <span dir="ltr">{d.bankAccount.cardNumber}</span>
              </p>
              <p>
                حساب: <span dir="ltr">{d.bankAccount.accountNumber ?? "—"}</span> — {d.bankAccount.isVerified ? "تأییدشده" : "تأییدنشده"}
              </p>
            </div>
          </Box>

          {(d.paidAt || d.rejectionReason || d.returnedAt) && (
            <Box title="نتیجه">
              {d.paidAt && (
                <p className="text-[12px]">
                  پرداخت: {faDateTime(d.paidAt)} — {PAYOUT_FA[d.payoutMethod ?? ""] ?? d.payoutMethod} — پیگیری{" "}
                  <span dir="ltr" className="font-bold">{d.bankReference}</span> — از حساب {d.sourceAccountCode}
                  {d.payoutBatchId && ` — دسته ${d.payoutBatchId}`}
                </p>
              )}
              {d.journal && (
                <p className="text-[12px]">
                  سند حسابداری: عطف {d.journal.referenceNumber.toLocaleString("fa-IR")}
                  {d.journal.permanentNumber ? ` — قطعی ${d.journal.permanentNumber.toLocaleString("fa-IR")}` : ""}{" "}
                  <Link href="/accounting/journal" className="text-emerald-700 font-bold">
                    دفتر روزنامه
                  </Link>
                </p>
              )}
              {d.rejectionReason && d.status === "REJECTED" && <p className="text-red-600 text-[12px]">دلیل رد: {d.rejectionReason}</p>}
              {d.returnedAt && (
                <p className="text-purple-700 text-[12px]">
                  برگشت از بانک: {faDateTime(d.returnedAt)} — {d.returnReason}
                </p>
              )}
            </Box>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <Box title="گردش تأیید">
              {d.approvals.length === 0 ? (
                <p className="text-gray-400 text-[12px]">—</p>
              ) : (
                <ul className="space-y-1 text-[12px]">
                  {d.approvals.map((a) => (
                    <li key={a.id}>
                      {a.status === "APPROVED" ? "✓" : "✕"} {a.approver} — {a.comment} — {faDateTime(a.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </Box>
            <Box title="پیامک‌ها">
              {d.smsLogs.length === 0 ? (
                <p className="text-gray-400 text-[12px]">—</p>
              ) : (
                <ul className="space-y-1 text-[11px]">
                  {d.smsLogs.map((l) => (
                    <li key={l.id}>
                      {l.templateKey} — {l.status} — {faDateTime(l.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
            </Box>
          </div>

          {/* ── اقدامات ── */}
          {mode === "none" && (
            <div className="flex flex-wrap gap-2">
              {d.status === "PENDING" && can("withdrawal.approve") && (
                <ActionButton
                  busy={act.busy}
                  onClick={() =>
                    void act.run(() => api.post(`/api/admin/withdrawals/${d.id}/approve`, { note: note || undefined }), "درخواست تأیید و به صف پرداخت منتقل شود؟").then((ok) => ok && done())
                  }
                >
                  <CheckCircle2 className="w-4 h-4" /> تأیید و انتقال به صف پرداخت
                </ActionButton>
              )}
              {d.status === "APPROVED" && can("withdrawal.pay") && (
                <ActionButton onClick={() => setMode("pay")}>
                  <Banknote className="w-4 h-4" /> ثبت پرداخت بانکی
                </ActionButton>
              )}
              {(d.status === "PENDING" || d.status === "APPROVED") && can("withdrawal.approve") && (
                <ActionButton variant="danger" onClick={() => setMode("reject")}>
                  <XCircle className="w-4 h-4" /> رد درخواست
                </ActionButton>
              )}
              {d.status === "PROCESSED" && can("withdrawal.pay") && (
                <ActionButton variant="secondary" onClick={() => setMode("return")}>
                  <RotateCcw className="w-4 h-4" /> ثبت برگشت وجه از بانک
                </ActionButton>
              )}
            </div>
          )}
          {d.status === "PENDING" && mode === "none" && (
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="یادداشت تأیید (اختیاری)" className={inputCls} />
          )}

          {(mode === "reject" || mode === "return") && (
            <div className="space-y-2">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder={mode === "reject" ? "دلیل رد (برای کاربر پیامک می‌شود)" : "دلیل برگشت (مثلاً شبای مسدود)"}
                className={inputCls}
              />
              <div className="flex gap-2">
                <ActionButton variant="secondary" onClick={() => setMode("none")}>
                  انصراف
                </ActionButton>
                <ActionButton
                  variant="danger"
                  busy={act.busy}
                  disabled={reason.trim().length < 5}
                  onClick={() =>
                    void act
                      .run(() => api.post(`/api/admin/withdrawals/${d.id}/${mode === "reject" ? "reject" : "returned"}`, { reason }))
                      .then((ok) => ok && done())
                  }
                >
                  {mode === "reject" ? "رد و آزادسازی موجودی" : "ثبت برگشت و بازگشت مبلغ به کیف پول"}
                </ActionButton>
              </div>
            </div>
          )}

          {mode === "pay" && <PayForm onCancel={() => setMode("none")} onSubmit={(body) => act.run(() => api.post(`/api/admin/withdrawals/${d.id}/pay`, body)).then((ok) => ok && done())} busy={act.busy} />}
        </div>
      )}
    </Modal>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 space-y-1">
      <p className="font-black text-[11px] text-gray-500">{title}</p>
      {children}
    </div>
  );
}

interface PayBody {
  bankReference: string;
  sourceAccountCode?: string;
  payoutMethod: string;
  paidAt?: string;
  note?: string;
}

function PayForm({
  onCancel,
  onSubmit,
  busy,
  batch,
}: {
  onCancel: () => void;
  onSubmit: (b: PayBody) => void;
  busy: boolean;
  batch?: boolean;
}) {
  const [bankReference, setBankReference] = useState("");
  const [sourceAccountCode, setSource] = useState("");
  const [payoutMethod, setMethod] = useState("PAYA");
  const [paidAt, setPaidAt] = useState(todayIsoLocal());
  const [note, setNote] = useState("");
  return (
    <div className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={batch ? "شماره پیگیری / مرجع فایل گروهی" : "شماره پیگیری بانکی"}>
          <input value={bankReference} onChange={(e) => setBankReference(e.target.value)} className={`${inputCls} text-left`} dir="ltr" />
        </Field>
        <Field label="روش پرداخت">
          <select value={payoutMethod} onChange={(e) => setMethod(e.target.value)} className={inputCls}>
            {Object.entries(PAYOUT_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="حساب بانکی مبدأ (شرکت)">
          <AccountSelect value={sourceAccountCode} onChange={setSource} filter={(a) => a.code.startsWith("1010")} placeholder="پیش‌فرض تنظیمات" />
        </Field>
        <Field label="تاریخ پرداخت">
          <JalaliDateInput value={paidAt} onChange={setPaidAt} max={todayIsoLocal()} clearable={false} />
        </Field>
      </div>
      <Field label="یادداشت (اختیاری)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
      </Field>
      <p className="text-[11px] text-gray-600">
        با ثبت پرداخت، مبلغ به‌طور قطعی از کیف پول کاربر کسر، رزرو آزاد و سند «بدهی ریالی کاربران / بانک مبدأ / درآمد کارمزد برداشت» صادر می‌شود.
      </p>
      <div className="flex gap-2">
        <ActionButton variant="secondary" onClick={onCancel}>
          انصراف
        </ActionButton>
        <ActionButton
          busy={busy}
          disabled={bankReference.trim().length < 3}
          onClick={() =>
            onSubmit({
              bankReference: bankReference.trim(),
              sourceAccountCode: sourceAccountCode || undefined,
              payoutMethod,
              paidAt: paidAt ? new Date(`${paidAt}T12:00:00`).toISOString() : undefined,
              note: note || undefined,
            })
          }
        >
          ثبت پرداخت
        </ActionButton>
      </div>
    </div>
  );
}

function BatchPayModal({ rows, onClose, onDone }: { rows: Row[]; onClose: () => void; onDone: () => void }) {
  const act = useAction();
  const [result, setResult] = useState<{ batchId: string; results: { id: string; ok: boolean; message: string }[] } | null>(null);
  const total = rows.reduce((s, r) => s + Number(r.netAmountRial), 0);
  return (
    <Modal title={`پرداخت گروهی ${rows.length.toLocaleString("fa-IR")} درخواست`} onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-[12px] text-gray-600">
          جمع خالص قابل پرداخت: <b>{toman(total)}</b> تومان. پیش از ثبت، فایل بانک را از دکمه‌ی «خروجی فایل بانک» دریافت و در اینترنت‌بانک بارگذاری کنید.
        </p>
        {act.error && <Alert kind="error" text={act.error} />}
        {result ? (
          <div className="space-y-2">
            <Alert kind="success" text={`دسته ${result.batchId} ثبت شد`} />
            <ul className="text-[12px] space-y-1 max-h-64 overflow-y-auto">
              {result.results.map((r) => {
                const row = rows.find((x) => x.id === r.id);
                return (
                  <li key={r.id} className={r.ok ? "text-green-700" : "text-red-600"}>
                    {row?.requestNumber}: {r.message}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <PayForm
            batch
            busy={act.busy}
            onCancel={onClose}
            onSubmit={(body) =>
              void act
                .run(async () => {
                  const res = await api.post("/api/admin/withdrawals/pay-batch", { ...body, ids: rows.map((r) => r.id) });
                  setResult(res.data as { batchId: string; results: { id: string; ok: boolean; message: string }[] });
                  onDone();
                  return res;
                })
            }
          />
        )}
      </div>
    </Modal>
  );
}
