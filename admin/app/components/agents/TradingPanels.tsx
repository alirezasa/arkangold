// admin/app/components/agents/TradingPanels.tsx
//
// پنل‌های مدیریت خرید و فروش قطعی نمایندگان: کیف پول نماینده (گردش، اصلاحیه، تسویه بدهی از
// کیف پول)، حساب‌های بانکی (تأیید مالکیت)، سفارش‌های خرید، واریز/برداشت، فروش شمش به شرکت،
// فهرست قیمت نمایندگی و صورتحساب‌های صادرشده به نام نماینده.
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import axios from "axios";
import { Check, FileText, Loader2, Plus, X } from "lucide-react";
import {
  Alert,
  Badge,
  Empty,
  Field,
  Modal,
  Pagination,
  PURITY_FA,
  Spinner,
  faDateTime,
  faNum,
  fetcher,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
  tomanToRial,
} from "./ui";
import {
  BANK_ACCOUNT_STATUS,
  BUYBACK_STATUS,
  DEPOSIT_STATUS,
  PURCHASE_STATUS,
  WITHDRAWAL_STATUS,
  type AgentBankAccount,
  type BuybackOrder,
  type PurchaseOrder,
} from "./trading";

type Paged<T> = { data: T[]; page: number; totalPages: number; total: number; totalAmountRial?: string };

function useAction(onDone?: () => void) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const run = async (fn: () => Promise<{ data?: { message?: string } } | unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await fn()) as { data?: { message?: string } };
      setMsg({ kind: "success", text: ok ?? r?.data?.message ?? "انجام شد" });
      onDone?.();
      return true;
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "عملیات ناموفق بود") });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, msg, setMsg, run };
}

function promptReason(title: string) {
  const r = window.prompt(title);
  return r && r.trim().length >= 5 ? r.trim() : null;
}

// ─────────────────────────── کیف پول نماینده ───────────────────────────

interface WalletResponse extends Paged<{
  id: string;
  typeLabel: string;
  creditRial: string;
  debitRial: string;
  balanceAfterRial: string;
  description: string;
  referenceNumber: string | null;
  createdAt: string;
}> {
  summary: { balanceRial: string; blockedRial: string; availableRial: string };
}

export function AgentWalletPanel({
  agentId,
  debtRial,
  canManage,
  onChanged,
}: {
  agentId: string;
  debtRial: string;
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [page, setPage] = useState(1);
  const { data, mutate } = useSWR<WalletResponse>(`/api/admin/agents/${agentId}/wallet?page=${page}&limit=20`, fetcher);
  const [adjust, setAdjust] = useState(false);
  const { busy, msg, run } = useAction(() => {
    void mutate();
    onChanged?.();
  });

  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3 text-[12px]">
        <div className="rounded-xl bg-gray-50 p-3">
          موجودی کیف پول: <b className="text-[14px]">{toman(data.summary.balanceRial)}</b> تومان
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          رزرو برداشت: <b>{toman(data.summary.blockedRial)}</b> تومان
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          بدهی (امانی/اعتباری): <b className={Number(debtRial) > 0 ? "text-red-600" : ""}>{toman(debtRial)}</b> تومان
        </div>
      </div>
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      {canManage && (
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={() => setAdjust(true)} className={secondaryBtn}>
            اصلاحیه کیف پول
          </button>
          {Number(debtRial) > 0 && Number(data.summary.availableRial) > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const amount = Math.min(Number(debtRial), Number(data.summary.availableRial));
                if (confirm(`${toman(amount)} تومان از بدهی از محل کیف پول نماینده تسویه شود؟`))
                  void run(() => axios.post(`/api/admin/agents/${agentId}/wallet/settle-debt`, { amountRial: amount }));
              }}
              className={secondaryBtn}
            >
              تسویه بدهی از کیف پول
            </button>
          )}
        </div>
      )}
      {!data.data.length ? (
        <Empty text="گردشی ثبت نشده است" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[640px]">
            <thead>
              <tr>
                <th>تاریخ</th>
                <th>نوع</th>
                <th>شرح</th>
                <th>واریز</th>
                <th>برداشت</th>
                <th>مانده</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((t) => (
                <tr key={t.id}>
                  <td className="text-[11px] text-gray-500">{faDateTime(t.createdAt)}</td>
                  <td className="font-bold text-[12px]">{t.typeLabel}</td>
                  <td className="text-[12px]">
                    {t.description}
                    {t.referenceNumber && <span className="block text-[10px] text-gray-400" dir="ltr">{t.referenceNumber}</span>}
                  </td>
                  <td className="text-green-700">{Number(t.creditRial) ? toman(t.creditRial) : "—"}</td>
                  <td className="text-red-600">{Number(t.debitRial) ? toman(t.debitRial) : "—"}</td>
                  <td className="font-black">{toman(t.balanceAfterRial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      {adjust && (
        <WalletAdjustModal
          agentId={agentId}
          onClose={() => setAdjust(false)}
          onDone={() => {
            setAdjust(false);
            void mutate();
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function WalletAdjustModal({ agentId, onClose, onDone }: { agentId: string; onClose: () => void; onDone: () => void }) {
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const { busy, msg, run } = useAction();
  return (
    <Modal title="اصلاحیه کیف پول نماینده" onClose={onClose}>
      <Alert kind="warn" text="اصلاحیه سند حسابداری ثبت می‌کند (افزایش: بد ۵۰۴۰ / بس ۲۰۷۰ — کاهش: بد ۲۰۷۰ / بس ۴۰۶۰). فقط برای اصلاح خطا یا پاداش/جریمه‌ی مستند استفاده شود." />
      <Field label="نوع">
        <select className={inputCls} value={direction} onChange={(e) => setDirection(e.target.value as "CREDIT" | "DEBIT")}>
          <option value="CREDIT">افزایش موجودی</option>
          <option value="DEBIT">کاهش موجودی</option>
        </select>
      </Field>
      <Field label="مبلغ (تومان)">
        <input className={inputCls} dir="ltr" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="شرح (حداقل ۱۰ کاراکتر)">
        <textarea className={inputCls} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      <button
        type="button"
        disabled={busy || !amount || reason.trim().length < 10}
        onClick={async () => {
          const ok = await run(() =>
            axios.post(`/api/admin/agents/${agentId}/wallet/adjust`, { direction, amountRial: tomanToRial(amount), reason }),
          );
          if (ok) onDone();
        }}
        className={`${primaryBtn} w-full`}
        style={primaryBtnStyle}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "ثبت اصلاحیه"}
      </button>
    </Modal>
  );
}

// ─────────────────────────── حساب‌های بانکی ───────────────────────────

export function BankAccountRow({
  account,
  agent,
  canReview,
  onChanged,
}: {
  account: AgentBankAccount;
  agent?: { code: string; name: string; managerName?: string };
  canReview: boolean;
  onChanged: () => void;
}) {
  const { busy, msg, run } = useAction(onChanged);
  return (
    <div className="rounded-xl border border-gray-100 p-3 text-[12px] space-y-1">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          {agent && (
            <p className="text-[11px] text-gray-500">
              {agent.name} (<span dir="ltr">{agent.code}</span>){agent.managerName ? ` — مدیر: ${agent.managerName}` : ""}
            </p>
          )}
          <p className="font-black">
            {account.bankName} — صاحب حساب: {account.ownerName}
            {account.isDefault && <span className="text-amber-600"> (پیش‌فرض)</span>}
          </p>
          <p className="font-mono" dir="ltr">
            {account.sheba}
            {account.cardNumber ? ` · ${account.cardNumber}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge map={BANK_ACCOUNT_STATUS} value={account.status} />
          {account.archivedAt && <span className="badge bg-gray-100 text-gray-500">حذف‌شده</span>}
          {canReview && !account.archivedAt && account.status !== "VERIFIED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => axios.post(`/api/admin/agents/trading/bank-accounts/${account.id}/review`, { approve: true }))}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 font-bold"
            >
              <Check className="w-3.5 h-3.5" /> تأیید مالکیت
            </button>
          )}
          {canReview && !account.archivedAt && account.status !== "REJECTED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const reason = promptReason("دلیل رد حساب (حداقل ۵ کاراکتر):");
                if (reason) void run(() => axios.post(`/api/admin/agents/trading/bank-accounts/${account.id}/review`, { approve: false, reason }));
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 font-bold"
            >
              <X className="w-3.5 h-3.5" /> رد
            </button>
          )}
        </div>
      </div>
      {account.rejectionReason && <p className="text-red-600">دلیل رد: {account.rejectionReason}</p>}
      {msg && <Alert kind={msg.kind} text={msg.text} />}
    </div>
  );
}

export function AgentBankAccountsPanel({ agentId, canManage }: { agentId: string; canManage: boolean }) {
  const { data, mutate } = useSWR<AgentBankAccount[]>(`/api/admin/agents/${agentId}/bank-accounts`, fetcher);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ bankName: "", sheba: "IR", ownerName: "" });
  const { busy, msg, run } = useAction(() => void mutate());
  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500">
        پیش از تأیید، مالکیت حساب را با نام نماینده (یا شخص حقوقی نمایندگی) تطبیق دهید (استعلام شبا). فقط حساب تأییدشده مبدأ واریز بانکی و
        مقصد برداشت/تسویه است.
      </p>
      {canManage && (
        <button type="button" onClick={() => setOpen((v) => !v)} className={secondaryBtn}>
          <Plus className="w-4 h-4" /> ثبت حساب برای نماینده
        </button>
      )}
      {open && (
        <div className="grid gap-2 sm:grid-cols-4 items-end rounded-xl border border-gray-100 p-3">
          <Field label="بانک">
            <input className={inputCls} value={f.bankName} onChange={(e) => setF({ ...f, bankName: e.target.value })} />
          </Field>
          <Field label="صاحب حساب">
            <input className={inputCls} value={f.ownerName} onChange={(e) => setF({ ...f, ownerName: e.target.value })} />
          </Field>
          <Field label="شبا">
            <input
              className={`${inputCls} font-mono`}
              dir="ltr"
              value={f.sheba}
              onChange={(e) => setF({ ...f, sheba: e.target.value.toUpperCase().replace(/[^IR0-9]/g, "").slice(0, 26) })}
            />
          </Field>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const ok = await run(() => axios.post(`/api/admin/agents/${agentId}/bank-accounts`, f));
              if (ok) setOpen(false);
            }}
            className={primaryBtn}
            style={primaryBtnStyle}
          >
            ثبت
          </button>
        </div>
      )}
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      {!data.length ? (
        <Empty text="حساب بانکی ثبت نشده است" />
      ) : (
        data.map((a) => <BankAccountRow key={a.id} account={a} canReview={canManage} onChanged={() => void mutate()} />)
      )}
    </div>
  );
}

// ─────────────────────────── سفارش‌های خرید ───────────────────────────

export function PurchaseOrdersTable({ agentId, status }: { agentId?: string; status?: string }) {
  const [page, setPage] = useState(1);
  const [st, setSt] = useState(status ?? "");
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (agentId) qs.set("agentId", agentId);
  if (st) qs.set("status", st);
  const { data } = useSWR<Paged<PurchaseOrder> & { totals: { approvedCount: number; totalRial: string; grams: string } }>(
    `/api/admin/agents/trading/orders?${qs.toString()}`,
    fetcher,
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select className={`${inputCls} max-w-xs mt-0`} value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }}>
          <option value="">همه‌ی وضعیت‌ها</option>
          {Object.entries(PURCHASE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        {data && (
          <span className="text-[12px] text-gray-500">
            {faNum(data.total)} سفارش — فروش قطعی‌شده: {toman(data.totals.totalRial)} تومان ({faNum(data.totals.grams, 4)} گرم)
          </span>
        )}
      </div>
      {!data ? (
        <Spinner />
      ) : !data.data.length ? (
        <Empty text="سفارشی یافت نشد" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[720px]">
            <thead>
              <tr>
                <th>شماره</th>
                {!agentId && <th>نماینده</th>}
                <th>تاریخ</th>
                <th>اقلام</th>
                <th>مبلغ (تومان)</th>
                <th>پرداخت</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((o) => (
                <tr key={o.id}>
                  <td className="font-bold" dir="ltr">
                    <Link href={`/agents/trading/orders/${o.id}`} className="underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  {!agentId && (
                    <td className="text-[12px]">
                      {o.agent.name} <span className="text-gray-400" dir="ltr">({o.agent.code})</span>
                    </td>
                  )}
                  <td className="text-[11px] text-gray-500">{faDateTime(o.createdAt)}</td>
                  <td className="text-[12px]">{o.items.map((i) => `${faNum(i.quantity)}× ${i.title}`).join("، ")}</td>
                  <td className="font-black">{toman(o.totalRial)}</td>
                  <td className="text-[11px]">{o.paymentMethodLabel}</td>
                  <td>
                    <Badge map={PURCHASE_STATUS} value={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}

// ─────────────────────────── واریزها ───────────────────────────

interface DepositRow {
  id: string;
  requestNumber: string;
  method: string;
  status: string;
  transferTypeLabel: string | null;
  amountRial: string;
  bankReference: string | null;
  paidAt: string | null;
  createdAt: string;
  rejectionReason: string | null;
  gatewayTrackingCode: string | null;
  agent: { id: string; code: string; name: string };
  sourceBankAccount: { bankName: string; sheba: string; ownerName: string } | null;
  purchaseOrder: { id: string; orderNumber: string; status: string } | null;
}

export function DepositsTable({ canManage, agentId }: { canManage: boolean; agentId?: string }) {
  const [page, setPage] = useState(1);
  const [st, setSt] = useState("PENDING_REVIEW");
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (st) qs.set("status", st);
  if (agentId) qs.set("agentId", agentId);
  const { data, mutate } = useSWR<Paged<DepositRow>>(`/api/admin/agents/trading/deposits?${qs.toString()}`, fetcher);
  const { busy, msg, run } = useAction(() => void mutate());
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select className={`${inputCls} max-w-xs mt-0`} value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }}>
          <option value="">همه</option>
          {Object.entries(DEPOSIT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        {data && <span className="text-[12px] text-gray-500">جمع: {toman(data.totalAmountRial)} تومان</span>}
      </div>
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      {!data ? (
        <Spinner />
      ) : !data.data.length ? (
        <Empty text="واریزی یافت نشد" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[820px]">
            <thead>
              <tr>
                <th>شماره</th>
                <th>نماینده</th>
                <th>مبلغ (تومان)</th>
                <th>روش / مرجع</th>
                <th>حساب مبدأ</th>
                <th>وضعیت</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {data.data.map((d) => (
                <tr key={d.id}>
                  <td dir="ltr" className="font-bold">
                    {d.requestNumber}
                    <span className="block text-[10px] text-gray-400">{faDateTime(d.createdAt)}</span>
                  </td>
                  <td className="text-[12px]">
                    {d.agent.name}
                    {d.purchaseOrder && <span className="block text-[10px] text-gray-500">سفارش {d.purchaseOrder.orderNumber}</span>}
                  </td>
                  <td className="font-black">{toman(d.amountRial)}</td>
                  <td className="text-[12px]">
                    {d.method === "GATEWAY" ? "درگاه" : d.transferTypeLabel}
                    <span className="block text-[10px] text-gray-500" dir="ltr">
                      {d.bankReference ?? d.gatewayTrackingCode ?? "—"}
                    </span>
                    {d.paidAt && <span className="block text-[10px] text-gray-400">واریز: {faDateTime(d.paidAt)}</span>}
                  </td>
                  <td className="text-[11px]">
                    {d.sourceBankAccount ? (
                      <>
                        {d.sourceBankAccount.bankName} — {d.sourceBankAccount.ownerName}
                        <span className="block font-mono" dir="ltr">
                          {d.sourceBankAccount.sheba}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <Badge map={DEPOSIT_STATUS} value={d.status} />
                    {d.rejectionReason && <span className="block text-[10px] text-red-600">{d.rejectionReason}</span>}
                  </td>
                  {canManage && (
                    <td>
                      {d.status === "PENDING_REVIEW" && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              confirm("واریز با صورتحساب بانک تطبیق داده شد و مبلغ به حساب شرکت رسیده است؟") &&
                              run(() => axios.post(`/api/admin/agents/trading/deposits/${d.id}/approve`))
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 text-[11px] font-bold"
                          >
                            تأیید
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const reason = promptReason("دلیل رد واریز:");
                              if (reason) void run(() => axios.post(`/api/admin/agents/trading/deposits/${d.id}/reject`, { reason }));
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold"
                          >
                            رد
                          </button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}

// ─────────────────────────── برداشت‌ها ───────────────────────────

interface WithdrawalRow {
  id: string;
  requestNumber: string;
  status: string;
  amountRial: string;
  destinationSnapshot: { bankName: string; sheba: string; ownerName: string };
  bankReference: string | null;
  rejectionReason: string | null;
  createdAt: string;
  agent: { id: string; code: string; name: string };
}

export function WithdrawalsTable({ canManage, agentId }: { canManage: boolean; agentId?: string }) {
  const [page, setPage] = useState(1);
  const [st, setSt] = useState("PENDING");
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (st) qs.set("status", st);
  if (agentId) qs.set("agentId", agentId);
  const { data, mutate } = useSWR<Paged<WithdrawalRow>>(`/api/admin/agents/trading/withdrawals?${qs.toString()}`, fetcher);
  const { busy, msg, run } = useAction(() => void mutate());
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <select className={`${inputCls} max-w-xs mt-0`} value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }}>
          <option value="">همه</option>
          {Object.entries(WITHDRAWAL_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
        {data && <span className="text-[12px] text-gray-500">جمع: {toman(data.totalAmountRial)} تومان</span>}
      </div>
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      {!data ? (
        <Spinner />
      ) : !data.data.length ? (
        <Empty text="درخواستی یافت نشد" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[760px]">
            <thead>
              <tr>
                <th>شماره</th>
                <th>نماینده</th>
                <th>مبلغ (تومان)</th>
                <th>حساب مقصد</th>
                <th>وضعیت</th>
                {canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {data.data.map((w) => (
                <tr key={w.id}>
                  <td dir="ltr" className="font-bold">
                    {w.requestNumber}
                    <span className="block text-[10px] text-gray-400">{faDateTime(w.createdAt)}</span>
                  </td>
                  <td className="text-[12px]">{w.agent.name}</td>
                  <td className="font-black">{toman(w.amountRial)}</td>
                  <td className="text-[11px]">
                    {w.destinationSnapshot.bankName} — {w.destinationSnapshot.ownerName}
                    <span className="block font-mono" dir="ltr">
                      {w.destinationSnapshot.sheba}
                    </span>
                  </td>
                  <td>
                    <Badge map={WITHDRAWAL_STATUS} value={w.status} />
                    {w.bankReference && <span className="block text-[10px] text-gray-500" dir="ltr">{w.bankReference}</span>}
                    {w.rejectionReason && <span className="block text-[10px] text-red-600">{w.rejectionReason}</span>}
                  </td>
                  {canManage && (
                    <td>
                      <div className="flex gap-1">
                        {w.status === "PENDING" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => run(() => axios.post(`/api/admin/agents/trading/withdrawals/${w.id}/approve`))}
                            className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-[11px] font-bold"
                          >
                            تأیید
                          </button>
                        )}
                        {w.status === "APPROVED" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const ref = window.prompt("شماره پیگیری پرداخت بانکی:");
                              if (ref && ref.trim().length >= 4)
                                void run(() => axios.post(`/api/admin/agents/trading/withdrawals/${w.id}/pay`, { bankReference: ref.trim() }));
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-green-50 text-green-700 text-[11px] font-bold"
                          >
                            ثبت پرداخت
                          </button>
                        )}
                        {(w.status === "PENDING" || w.status === "APPROVED") && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const reason = promptReason("دلیل رد برداشت:");
                              if (reason) void run(() => axios.post(`/api/admin/agents/trading/withdrawals/${w.id}/reject`, { reason }));
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 text-[11px] font-bold"
                          >
                            رد
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}

// ─────────────────────────── فروش شمش نماینده به شرکت ───────────────────────────

export function BuybacksTable({ canManage, canPay, agentId }: { canManage: boolean; canPay: boolean; agentId?: string }) {
  const [page, setPage] = useState(1);
  const [st, setSt] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const qs = new URLSearchParams({ page: String(page), limit: "20" });
  if (st) qs.set("status", st);
  if (agentId) qs.set("agentId", agentId);
  const { data, mutate } = useSWR<Paged<BuybackOrder>>(`/api/admin/agents/trading/buybacks?${qs.toString()}`, fetcher);
  return (
    <div className="space-y-3">
      <select className={`${inputCls} max-w-xs mt-0`} value={st} onChange={(e) => { setSt(e.target.value); setPage(1); }}>
        <option value="">همه‌ی وضعیت‌ها</option>
        {Object.entries(BUYBACK_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      {!data ? (
        <Spinner />
      ) : !data.data.length ? (
        <Empty text="درخواستی یافت نشد" />
      ) : (
        <div className="space-y-2">
          {data.data.map((o) => (
            <div key={o.id} className="rounded-xl border border-gray-100">
              <button type="button" onClick={() => setOpenId(openId === o.id ? null : o.id)} className="w-full flex items-center justify-between gap-2 p-3 text-[12px] text-right flex-wrap">
                <span className="font-black" dir="ltr">
                  {o.orderNumber}
                </span>
                <span>{o.agent.name}</span>
                <span>
                  {faNum(o._count?.items ?? 0)} شمش · {faNum(o.totalWeightGrams, 4)} گرم
                </span>
                <span className="font-bold">{toman(o.finalTotalRial ?? o.quotedTotalRial)} ت</span>
                <Badge map={BUYBACK_STATUS} value={o.status} />
              </button>
              {openId === o.id && (
                <BuybackDetail id={o.id} canManage={canManage} canPay={canPay} onChanged={() => void mutate()} />
              )}
            </div>
          ))}
        </div>
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}

function BuybackDetail({ id, canManage, canPay, onChanged }: { id: string; canManage: boolean; canPay: boolean; onChanged: () => void }) {
  const { data, mutate } = useSWR<BuybackOrder>(`/api/admin/agents/trading/buybacks/${id}`, fetcher);
  const [inspect, setInspect] = useState<Record<string, { accepted: boolean; finalToman: string; note: string }>>({});
  const [note, setNote] = useState("");
  const { busy, msg, run } = useAction(() => {
    void mutate();
    onChanged();
  });
  if (!data) return <Spinner />;
  const items = data.items ?? [];
  const row = (code: string, quoted: string) => inspect[code] ?? { accepted: true, finalToman: String(Math.round(Number(quoted) / 10)), note: "" };

  return (
    <div className="border-t border-gray-100 p-3 space-y-3 text-[12px]">
      <p>
        مهلت تحویل: {faDateTime(data.deliveryDeadline)} — تسویه به {data.payoutMethod === "WALLET" ? "کیف پول نماینده" : `حساب ${data.bankAccount?.bankName ?? ""} ${data.bankAccount?.sheba ?? ""}`}
      </p>
      <p>
        صورتحساب نماینده به نام شرکت:{" "}
        {data.agentInvoiceNumber ? (
          <b dir="ltr">
            {data.agentInvoiceNumber} ({faDateTime(data.agentInvoiceDate)})
          </b>
        ) : (
          <span className="text-amber-700">هنوز ثبت نشده</span>
        )}
      </p>
      <div className="overflow-x-auto">
        <table className="admin-table w-full min-w-[600px]">
          <thead>
            <tr>
              <th>کد</th>
              <th>وزن / عیار</th>
              <th>مبلغ قفل‌شده (ت)</th>
              <th>{data.status === "PENDING_DELIVERY" ? "نتیجه‌ی بازرسی" : "مبلغ نهایی (ت)"}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td className="font-mono" dir="ltr">
                  {i.code}
                </td>
                <td>
                  {faNum(i.weightGrams, 4)} گرم — {PURITY_FA[i.purityKarat] ?? i.purityKarat}
                </td>
                <td>{toman(i.quotedRial)}</td>
                <td>
                  {data.status === "PENDING_DELIVERY" && canManage ? (
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={row(i.code, i.quotedRial).accepted}
                          onChange={(e) => setInspect({ ...inspect, [i.code]: { ...row(i.code, i.quotedRial), accepted: e.target.checked } })}
                        />
                        پذیرش
                      </label>
                      <input
                        className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-left"
                        dir="ltr"
                        value={row(i.code, i.quotedRial).finalToman}
                        onChange={(e) =>
                          setInspect({ ...inspect, [i.code]: { ...row(i.code, i.quotedRial), finalToman: e.target.value.replace(/\D/g, "") } })
                        }
                      />
                    </div>
                  ) : (
                    <span className={i.accepted ? "" : "text-red-600 line-through"}>{toman(i.finalRial ?? i.quotedRial)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.inspectionNote && <p>نتیجه‌ی بازرسی: {data.inspectionNote}</p>}
      {data.rejectionReason && <p className="text-red-600">{data.rejectionReason}</p>}
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      <div className="flex gap-2 flex-wrap items-end">
        {data.status === "PENDING_DELIVERY" && canManage && (
          <>
            <Field label="یادداشت بازرسی (عیار، وزن، هولوگرام، بسته‌بندی)">
              <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(() =>
                  axios.post(`/api/admin/agents/trading/buybacks/${id}/receive`, {
                    inspectionNote: note || undefined,
                    items: items.map((i) => {
                      const r = row(i.code, i.quotedRial);
                      return { code: i.code, accepted: r.accepted, finalRial: r.accepted ? Number(r.finalToman) * 10 : undefined };
                    }),
                  }),
                )
              }
              className={primaryBtn}
              style={primaryBtnStyle}
            >
              ثبت دریافت و بازرسی
            </button>
          </>
        )}
        {data.status === "RECEIVED" && canManage && (
          <button type="button" disabled={busy} onClick={() => run(() => axios.post(`/api/admin/agents/trading/buybacks/${id}/approve`))} className={primaryBtn} style={primaryBtnStyle}>
            تأیید خرید
          </button>
        )}
        {data.status === "APPROVED" && canPay && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (data.payoutMethod === "BANK") {
                const ref = window.prompt("شماره پیگیری پرداخت بانکی:");
                if (ref && ref.trim().length >= 4) void run(() => axios.post(`/api/admin/agents/trading/buybacks/${id}/pay`, { bankReference: ref.trim() }));
              } else if (confirm("مبلغ نهایی به کیف پول نماینده واریز و شمش‌ها وارد خزانه شوند؟")) {
                void run(() => axios.post(`/api/admin/agents/trading/buybacks/${id}/pay`, {}));
              }
            }}
            className={primaryBtn}
            style={primaryBtnStyle}
          >
            تسویه و ورود به خزانه
          </button>
        )}
        {["PENDING_DELIVERY", "RECEIVED", "APPROVED"].includes(data.status) && canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const reason = promptReason("دلیل رد (شمش‌ها به موجودی نماینده برمی‌گردد):");
              if (reason) void run(() => axios.post(`/api/admin/agents/trading/buybacks/${id}/reject`, { reason }));
            }}
            className={secondaryBtn}
          >
            رد و برگشت شمش‌ها
          </button>
        )}
        {data.voucherNumber && (
          <a href={`/agent-docs/voucher/${encodeURIComponent(data.voucherNumber)}`} target="_blank" rel="noreferrer" className={secondaryBtn}>
            حواله ورود به خزانه
          </a>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── فهرست قیمت نمایندگی ───────────────────────────

interface PriceItemRow {
  id: string;
  title: string;
  weightGrams: string;
  purityKarat: "K18" | "K24";
  premiumRial: string;
  consumerPremiumRial: string;
  maxPerOrder: number | null;
  isActive: boolean;
  sortOrder: number;
  live: { unitPriceRial: string; consumerMaxPriceRial: string };
}

export function PriceItemsPanel({ canManage }: { canManage: boolean }) {
  const { data, mutate } = useSWR<PriceItemRow[]>("/api/admin/agents/trading/price-items", fetcher);
  const [f, setF] = useState({ title: "", weightGrams: "", purityKarat: "K24", premiumToman: "", consumerPremiumToman: "", maxPerOrder: "" });
  const { busy, msg, run } = useAction(() => void mutate());
  if (!data) return <Spinner />;
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-gray-500">
        قیمت نمایندگی هر شمش = وزن × قیمت لحظه‌ای هر گرم (بر اساس عیار) × (۱ + درصد افزوده‌ی تنظیمات) + اجرت. سقف قیمت مصرف‌کننده (بند ۸-۳
        قرارداد) = وزن × قیمت گرم × (۱ + درصد مجاز مصرف‌کننده) + اجرت مصرف‌کننده.
      </p>
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      {canManage && (
        <div className="grid gap-2 sm:grid-cols-7 items-end rounded-xl border border-gray-100 p-3">
          <div className="sm:col-span-2">
            <Field label="عنوان">
              <input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="شمش ۱۰ گرمی" />
            </Field>
          </div>
          <Field label="وزن (گرم)">
            <input className={inputCls} dir="ltr" value={f.weightGrams} onChange={(e) => setF({ ...f, weightGrams: e.target.value.replace(/[^\d.]/g, "") })} />
          </Field>
          <Field label="عیار">
            <select className={inputCls} value={f.purityKarat} onChange={(e) => setF({ ...f, purityKarat: e.target.value })}>
              <option value="K24">۲۴</option>
              <option value="K18">۱۸</option>
            </select>
          </Field>
          <Field label="اجرت نمایندگی (ت)">
            <input className={inputCls} dir="ltr" value={f.premiumToman} onChange={(e) => setF({ ...f, premiumToman: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="اجرت مصرف‌کننده (ت)">
            <input className={inputCls} dir="ltr" value={f.consumerPremiumToman} onChange={(e) => setF({ ...f, consumerPremiumToman: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <button
            type="button"
            disabled={busy || !f.title || !f.weightGrams}
            onClick={() =>
              run(() =>
                axios.post("/api/admin/agents/trading/price-items", {
                  title: f.title,
                  weightGrams: Number(f.weightGrams),
                  purityKarat: f.purityKarat,
                  premiumRial: Number(f.premiumToman || 0) * 10,
                  consumerPremiumRial: Number(f.consumerPremiumToman || 0) * 10,
                  maxPerOrder: f.maxPerOrder ? Number(f.maxPerOrder) : undefined,
                }),
              )
            }
            className={primaryBtn}
            style={primaryBtnStyle}
          >
            <Plus className="w-4 h-4" /> افزودن
          </button>
        </div>
      )}
      {!data.length ? (
        <Empty text="هنوز قلمی تعریف نشده است؛ تا تعریف فهرست قیمت، نمایندگان امکان سفارش ندارند" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[760px]">
            <thead>
              <tr>
                <th>عنوان</th>
                <th>وزن / عیار</th>
                <th>اجرت نمایندگی (ت)</th>
                <th>اجرت مصرف‌کننده (ت)</th>
                <th>قیمت لحظه‌ای نمایندگی (ت)</th>
                <th>سقف مصرف‌کننده (ت)</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className={p.isActive ? "" : "opacity-50"}>
                  <td className="font-bold">{p.title}</td>
                  <td>
                    {faNum(p.weightGrams, 4)} گرم — {PURITY_FA[p.purityKarat]}
                  </td>
                  <td>{toman(p.premiumRial)}</td>
                  <td>{toman(p.consumerPremiumRial)}</td>
                  <td className="font-black">{toman(p.live.unitPriceRial)}</td>
                  <td>{toman(p.live.consumerMaxPriceRial)}</td>
                  <td>
                    {canManage ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => axios.patch(`/api/admin/agents/trading/price-items/${p.id}`, { isActive: !p.isActive }))}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${p.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}
                      >
                        {p.isActive ? "فعال" : "غیرفعال"}
                      </button>
                    ) : p.isActive ? (
                      "فعال"
                    ) : (
                      "غیرفعال"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── صورتحساب‌های صادرشده به نام نماینده ───────────────────────────

export function AgentCompanyInvoicesPanel({ agentId }: { agentId: string }) {
  const [page, setPage] = useState(1);
  const { data } = useSWR<{
    items: { id: string; kind: string; invoiceNumberFa: string; status: string; totalRial: string; issuedAtJalali: string; sourceType: string }[];
    page: number;
    totalPages: number;
  }>(`/api/admin/agents/${agentId}/company-invoices?page=${page}&limit=20`, fetcher);
  if (!data) return <Spinner />;
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-gray-500">صورتحساب‌های فروش و پیش‌فاکتورهای صادرشده به نام این نماینده (شرکت برای مشتریان نماینده فاکتور صادر نمی‌کند).</p>
      {!data.items.length ? (
        <Empty text="سندی صادر نشده است" />
      ) : (
        <div className="overflow-x-auto">
          <table className="admin-table w-full min-w-[560px]">
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id}>
                  <td dir="ltr" className="font-bold">
                    {i.invoiceNumberFa}
                  </td>
                  <td>{i.kind === "PROFORMA" ? "پیش‌فاکتور" : "صورتحساب"}</td>
                  <td className="text-[12px]">{i.sourceType === "AGENT_PURCHASE" ? "سفارش خرید" : "فروش امانی"}</td>
                  <td className="text-[12px]">{i.issuedAtJalali}</td>
                  <td className="font-black">{toman(i.totalRial)} ت</td>
                  <td className="text-[12px]">{i.status}</td>
                  <td>
                    <a href={`/invoices/${i.id}/print`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[12px] font-bold" style={{ color: "var(--color-emerald)" }}>
                      <FileText className="w-4 h-4" /> مشاهده
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </div>
  );
}
