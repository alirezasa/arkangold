// admin/app/(dashboard)/agent-portal/wallet/page.tsx
//
// کیف پول ریالی نمایندگی (کاملاً جدا از کیف پول کاربران): موجودی، گردش، واریز از درگاه یا
// واریز بانکی/حساب به حساب از حساب تأییدشده‌ی خود نماینده، برداشت به حساب تأییدشده و
// مدیریت حساب‌های بانکی (بند ۵-۱ و ۸-۹ قرارداد).
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import PaymentResultBanner from "@/app/components/agents/PaymentResultBanner";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  PiggyBank,
  Plus,
  Star,
  Trash2,
  Wallet,
} from "lucide-react";
import {
  Alert,
  Badge,
  Empty,
  Field,
  Kpi,
  Pagination,
  Spinner,
  cardStyle,
  faDateTime,
  fetcher,
  getErrorMessage,
  inputCls,
  primaryBtn,
  primaryBtnStyle,
  secondaryBtn,
  toman,
  tomanToRial,
} from "@/app/components/agents/ui";
import {
  BANK_ACCOUNT_STATUS,
  DEPOSIT_STATUS,
  TRANSFER_TYPES,
  WITHDRAWAL_STATUS,
  type AgentBankAccount,
} from "@/app/components/agents/trading";

interface WalletSummary {
  balanceRial: string;
  blockedRial: string;
  availableRial: string;
}

interface WalletTx {
  id: string;
  type: string;
  typeLabel: string;
  creditRial: string;
  debitRial: string;
  balanceAfterRial: string;
  description: string;
  referenceNumber: string | null;
  createdAt: string;
}

interface Paged<T> {
  data: T[];
  page: number;
  totalPages: number;
  total: number;
}

interface DepositRow {
  id: string;
  requestNumber: string;
  method: "GATEWAY" | "BANK_TRANSFER";
  status: string;
  statusLabel: string;
  transferTypeLabel: string | null;
  amountRial: string;
  bankReference: string | null;
  rejectionReason: string | null;
  createdAt: string;
  purchaseOrder: { orderNumber: string } | null;
}

interface WithdrawalRow {
  id: string;
  requestNumber: string;
  status: string;
  amountRial: string;
  destinationSnapshot: { bankName: string; sheba: string };
  bankReference: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

type Tab = "tx" | "deposit" | "withdraw" | "accounts";

export default function AgentWalletPage() {
  const [tab, setTab] = useState<Tab>("tx");
  const { data: summary, mutate: refreshSummary } = useSWR<WalletSummary>("/api/agent-portal/wallet", fetcher);
  const { data: accounts, mutate: refreshAccounts } = useSWR<AgentBankAccount[]>("/api/agent-portal/bank-accounts", fetcher);


  const verified = (accounts ?? []).filter((a) => a.status === "VERIFIED");
  const refreshAll = () => {
    void refreshSummary();
    void refreshAccounts();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <Wallet className="w-5 h-5" /> کیف پول نمایندگی
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          کیف پول ریالی نمایندگی از کیف پول کاربران جداست و فقط برای پرداخت سفارش خرید شمش، دریافت وجه فروش شمش به شرکت و برداشت
          به حساب بانکی خود شما استفاده می‌شود.
        </p>
      </div>

      <PaymentResultBanner
        success="پرداخت درگاه موفق بود و مبلغ به کیف پول نمایندگی واریز شد."
        failed="پرداخت درگاه ناموفق بود یا لغو شد؛ مبلغی از کیف پول شما کسر نشد."
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kpi title="موجودی قابل استفاده" icon={PiggyBank} color="#0f766e" value={summary ? `${toman(summary.availableRial)} تومان` : "…"} />
        <Kpi title="رزرو برداشت در جریان" icon={ArrowUpRight} color="#b45309" value={summary ? `${toman(summary.blockedRial)} تومان` : "…"} />
        <Kpi
          title="حساب‌های بانکی تأییدشده"
          icon={Landmark}
          value={`${verified.length.toLocaleString("fa-IR")} حساب`}
          hint={verified.length ? "مقصد برداشت و مبدأ واریز بانکی" : "برای واریز بانکی و برداشت، حساب بانکی معرفی کنید"}
        />
      </div>

      {accounts && verified.length === 0 && (
        <Alert
          kind="warn"
          text="هنوز حساب بانکی تأییدشده ندارید. برای برداشت و واریز بانکی ابتدا در زبانه‌ی «حساب‌های بانکی» حساب متعلق به خود (یا شرکت نمایندگی) را معرفی کنید تا واحد مالی تأیید کند."
        />
      )}

      <div className="flex gap-1 p-1 rounded-2xl bg-gray-100 w-fit flex-wrap">
        {(
          [
            ["tx", "گردش کیف پول"],
            ["deposit", "واریز"],
            ["withdraw", "برداشت"],
            ["accounts", "حساب‌های بانکی"],
          ] as [Tab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-[12px] font-black ${tab === k ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "tx" && <TransactionsTab />}
      {tab === "deposit" && <DepositTab verified={verified} onDone={refreshAll} />}
      {tab === "withdraw" && <WithdrawTab verified={verified} summary={summary} onDone={refreshAll} />}
      {tab === "accounts" && <AccountsTab accounts={accounts} onChange={refreshAll} />}
    </div>
  );
}

function TransactionsTab() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<Paged<WalletTx>>(`/api/agent-portal/wallet/transactions?page=${page}&limit=20`, fetcher);
  if (isLoading || !data) return <Spinner />;
  return (
    <div className="rounded-2xl p-4" style={cardStyle}>
      {!data.data.length ? (
        <Empty text="هنوز گردشی در کیف پول ثبت نشده است" />
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
                  <td className="font-bold">{t.typeLabel}</td>
                  <td className="text-[12px]">
                    {t.description}
                    {t.referenceNumber && (
                      <span className="block text-[10px] text-gray-400" dir="ltr">
                        {t.referenceNumber}
                      </span>
                    )}
                  </td>
                  <td className="text-green-700 font-bold">{Number(t.creditRial) ? toman(t.creditRial) : "—"}</td>
                  <td className="text-red-600 font-bold">{Number(t.debitRial) ? toman(t.debitRial) : "—"}</td>
                  <td className="font-black">{toman(t.balanceAfterRial)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
      <p className="text-[10px] text-gray-400 mt-2">مبالغ به تومان است.</p>
    </div>
  );
}

function DepositTab({ verified, onDone }: { verified: AgentBankAccount[]; onDone: () => void }) {
  const [method, setMethod] = useState<"GATEWAY" | "BANK_TRANSFER">("GATEWAY");
  const [amount, setAmount] = useState("");
  const [gateway, setGateway] = useState<"ZARINPAL" | "BEHPARDAKHT">("ZARINPAL");
  const [source, setSource] = useState("");
  const [transferType, setTransferType] = useState("SATNA");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const { data: dest } = useSWR<{
    destination: { owner: string; bank: string; accountNumber: string; sheba: string };
    gatewayMaxRial: string;
  }>("/api/agent-portal/deposit-destination", fetcher);
  const { data: list, mutate } = useSWR<Paged<DepositRow>>(`/api/agent-portal/deposits?page=${page}&limit=10`, fetcher);

  const submit = async () => {
    const amountRial = tomanToRial(amount);
    if (!amountRial || amountRial < 10_000) return setMsg({ kind: "error", text: "مبلغ واریز را به تومان وارد کنید" });
    setBusy(true);
    setMsg(null);
    try {
      const body =
        method === "GATEWAY"
          ? { amountRial, method, gateway }
          : { amountRial, method, transferType, sourceBankAccountId: source, bankReference: reference.trim() };
      const { data } = await axios.post("/api/agent-portal/deposits", body);
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }
      setMsg({ kind: "success", text: data.message ?? "ثبت شد" });
      setAmount("");
      setReference("");
      void mutate();
      onDone();
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "ثبت واریز ممکن نشد") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800 flex items-center gap-2">
          <ArrowDownLeft className="w-4 h-4" /> افزایش موجودی کیف پول
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["GATEWAY", "درگاه پرداخت", CreditCard],
              ["BANK_TRANSFER", "واریز بانکی / حساب به حساب", Banknote],
            ] as const
          ).map(([k, label, Icon]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMethod(k)}
              className={`p-3 rounded-xl border-2 text-[12px] font-black flex items-center gap-2 ${
                method === k ? "border-emerald-700 bg-emerald-50 text-emerald-800" : "border-gray-200 text-gray-600"
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        <Field label="مبلغ (تومان)">
          <input className={inputCls} inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        {method === "GATEWAY" ? (
          <>
            <Field label="درگاه">
              <select className={inputCls} value={gateway} onChange={(e) => setGateway(e.target.value as "ZARINPAL" | "BEHPARDAKHT")}>
                <option value="ZARINPAL">زرین‌پال</option>
                <option value="BEHPARDAKHT">به‌پرداخت ملت</option>
              </select>
            </Field>
            {dest && Number(dest.gatewayMaxRial) > 0 && (
              <p className="text-[11px] text-gray-400">
                سقف هر پرداخت درگاهی {toman(dest.gatewayMaxRial)} تومان است؛ برای مبالغ بیشتر از واریز بانکی (ساتنا/پایا/پل) استفاده کنید.
              </p>
            )}
          </>
        ) : (
          <>
            {dest && (
              <div className="rounded-xl bg-gray-50 p-3 text-[12px] space-y-1">
                <p className="font-black text-gray-700">حساب رسمی شرکت</p>
                {dest.destination.owner && <p>صاحب حساب: {dest.destination.owner}</p>}
                {dest.destination.bank && <p>بانک: {dest.destination.bank}</p>}
                {dest.destination.sheba && (
                  <p>
                    شبا: <bdi dir="ltr" className="font-mono">{dest.destination.sheba}</bdi>
                  </p>
                )}
                {dest.destination.accountNumber && (
                  <p>
                    شماره حساب: <bdi dir="ltr" className="font-mono">{dest.destination.accountNumber}</bdi>
                  </p>
                )}
                <p className="text-[11px] text-amber-700">
                  واریز فقط از حساب تأییدشده‌ی خودتان معتبر است؛ واریز نقدی یا به حساب اشخاص دیگر (حتی کارکنان شرکت) پذیرفته نمی‌شود.
                </p>
              </div>
            )}
            <Field label="حساب مبدأ (تأییدشده)">
              <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
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
                <select className={inputCls} value={transferType} onChange={(e) => setTransferType(e.target.value)}>
                  {TRANSFER_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="شماره پیگیری / مرجع">
                <input className={inputCls} dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
              </Field>
            </div>
          </>
        )}
        {msg && <Alert kind={msg.kind} text={msg.text} />}
        <button
          type="button"
          disabled={busy || (method === "BANK_TRANSFER" && (!source || reference.trim().length < 4))}
          onClick={submit}
          className={`${primaryBtn} w-full`}
          style={primaryBtnStyle}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : method === "GATEWAY" ? "انتقال به درگاه" : "ثبت مشخصات واریز"}
        </button>
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800 mb-3">واریزهای اخیر</h2>
        {!list?.data.length ? (
          <Empty text="واریزی ثبت نشده است" />
        ) : (
          <div className="space-y-2">
            {list.data.map((d) => (
              <div key={d.id} className="rounded-xl border border-gray-100 p-3 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black" dir="ltr">
                    {d.requestNumber}
                  </span>
                  <Badge map={DEPOSIT_STATUS} value={d.status} />
                </div>
                <p className="mt-1">
                  {toman(d.amountRial)} تومان — {d.method === "GATEWAY" ? "درگاه" : d.transferTypeLabel ?? "واریز بانکی"}
                  {d.bankReference && <span className="text-gray-400"> — مرجع <bdi dir="ltr">{d.bankReference}</bdi></span>}
                </p>
                {d.purchaseOrder && <p className="text-[11px] text-gray-500">بابت سفارش {d.purchaseOrder.orderNumber}</p>}
                {d.rejectionReason && <p className="text-[11px] text-red-600">{d.rejectionReason}</p>}
                <p className="text-[10px] text-gray-400">{faDateTime(d.createdAt)}</p>
              </div>
            ))}
            <Pagination page={list.page} totalPages={list.totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

function WithdrawTab({
  verified,
  summary,
  onDone,
}: {
  verified: AgentBankAccount[];
  summary?: WalletSummary;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [account, setAccount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [page, setPage] = useState(1);
  const { data: list, mutate } = useSWR<Paged<WithdrawalRow>>(`/api/agent-portal/withdrawals?page=${page}&limit=10`, fetcher);

  const submit = async () => {
    const amountRial = tomanToRial(amount);
    if (!amountRial) return setMsg({ kind: "error", text: "مبلغ برداشت را وارد کنید" });
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await axios.post("/api/agent-portal/withdrawals", { amountRial, bankAccountId: account });
      setMsg({ kind: "success", text: data.message });
      setAmount("");
      void mutate();
      onDone();
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "ثبت برداشت ممکن نشد") });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await axios.post(`/api/agent-portal/withdrawals/${id}/cancel`);
      void mutate();
      onDone();
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "لغو ممکن نشد") });
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800 flex items-center gap-2">
          <ArrowUpRight className="w-4 h-4" /> برداشت به حساب بانکی
        </h2>
        <p className="text-[11px] text-gray-500">
          موجودی قابل برداشت: <b>{summary ? toman(summary.availableRial) : "…"} تومان</b>. مبلغ تا پرداخت بانکی رزرو می‌شود. تا زمانی که به شرکت
          بدهی دارید، ابتدا بدهی را تسویه کنید.
        </p>
        <Field label="مبلغ (تومان)">
          <input className={inputCls} inputMode="numeric" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} />
        </Field>
        <Field label="حساب مقصد (فقط حساب تأییدشده‌ی خودتان)">
          <select className={inputCls} value={account} onChange={(e) => setAccount(e.target.value)}>
            <option value="">انتخاب کنید</option>
            {verified.map((a) => (
              <option key={a.id} value={a.id}>
                {a.bankName} — {a.sheba} {a.isDefault ? "(پیش‌فرض)" : ""}
              </option>
            ))}
          </select>
        </Field>
        {msg && <Alert kind={msg.kind} text={msg.text} />}
        <button type="button" disabled={busy || !account} onClick={submit} className={`${primaryBtn} w-full`} style={primaryBtnStyle}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "ثبت درخواست برداشت"}
        </button>
      </div>
      <div className="rounded-2xl p-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800 mb-3">درخواست‌های برداشت</h2>
        {!list?.data.length ? (
          <Empty text="درخواست برداشتی ثبت نشده است" />
        ) : (
          <div className="space-y-2">
            {list.data.map((w) => (
              <div key={w.id} className="rounded-xl border border-gray-100 p-3 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-black" dir="ltr">
                    {w.requestNumber}
                  </span>
                  <Badge map={WITHDRAWAL_STATUS} value={w.status} />
                </div>
                <p className="mt-1">
                  {toman(w.amountRial)} تومان به {w.destinationSnapshot.bankName} — <bdi dir="ltr">{w.destinationSnapshot.sheba}</bdi>
                </p>
                {w.bankReference && (
                  <p className="text-[11px] text-gray-500">
                    پیگیری بانکی: <bdi dir="ltr">{w.bankReference}</bdi>
                  </p>
                )}
                {w.rejectionReason && <p className="text-[11px] text-red-600">{w.rejectionReason}</p>}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">{faDateTime(w.createdAt)}</span>
                  {w.status === "PENDING" && (
                    <button type="button" onClick={() => cancel(w.id)} className="text-[11px] font-bold text-red-600">
                      لغو
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Pagination page={list.page} totalPages={list.totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

function AccountsTab({ accounts, onChange }: { accounts?: AgentBankAccount[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ bankName: "", sheba: "IR", ownerName: "", accountNumber: "", cardNumber: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await fn()) as { data?: { message?: string } };
      setMsg({ kind: "success", text: ok ?? r?.data?.message ?? "انجام شد" });
      onChange();
      return true;
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "عملیات ناموفق بود") });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const ok = await act(() =>
      axios.post("/api/agent-portal/bank-accounts", {
        bankName: form.bankName,
        sheba: form.sheba,
        ownerName: form.ownerName,
        accountNumber: form.accountNumber || undefined,
        cardNumber: form.cardNumber || undefined,
      }),
    );
    if (ok) {
      setOpen(false);
      setForm({ bankName: "", sheba: "IR", ownerName: "", accountNumber: "", cardNumber: "" });
    }
  };

  if (!accounts) return <Spinner />;
  return (
    <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-black text-gray-800">حساب‌های بانکی نمایندگی</h2>
        <button type="button" onClick={() => setOpen((v) => !v)} className={secondaryBtn}>
          <Plus className="w-4 h-4" /> معرفی حساب جدید
        </button>
      </div>
      <p className="text-[11px] text-gray-500">
        حساب باید متعلق به خود شما (یا شخص حقوقی نمایندگی) باشد. واحد مالی مالکیت حساب را بررسی و تأیید می‌کند؛ هر تغییر حساب را حداکثر
        ظرف ۷ روز در پنل اعلام کنید (بند ۸-۹ قرارداد).
      </p>
      {msg && <Alert kind={msg.kind} text={msg.text} />}
      {open && (
        <div className="grid gap-2 sm:grid-cols-2 rounded-xl border border-gray-100 p-3">
          <Field label="نام بانک">
            <input className={inputCls} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </Field>
          <Field label="نام صاحب حساب">
            <input className={inputCls} value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} />
          </Field>
          <Field label="شماره شبا" hint="با IR و ۲۴ رقم">
            <input
              className={`${inputCls} font-mono`}
              dir="ltr"
              value={form.sheba}
              onChange={(e) => setForm({ ...form, sheba: e.target.value.toUpperCase().replace(/[^IR0-9]/g, "").slice(0, 26) })}
            />
          </Field>
          <Field label="شماره کارت (اختیاری)">
            <input className={`${inputCls} font-mono`} dir="ltr" value={form.cardNumber} onChange={(e) => setForm({ ...form, cardNumber: e.target.value.replace(/\D/g, "").slice(0, 16) })} />
          </Field>
          <Field label="شماره حساب (اختیاری)">
            <input className={`${inputCls} font-mono`} dir="ltr" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <button type="button" disabled={busy} onClick={add} className={`${primaryBtn} w-full`} style={primaryBtnStyle}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "ثبت و ارسال برای تأیید"}
            </button>
          </div>
        </div>
      )}
      {!accounts.length ? (
        <Empty text="حساب بانکی ثبت نشده است" />
      ) : (
        <div className="space-y-2">
          {accounts.map((a) => (
            <div key={a.id} className="rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[12px]">
                <p className="font-black text-gray-800 flex items-center gap-2">
                  {a.bankName} — {a.ownerName}
                  {a.isDefault && <Star className="w-3.5 h-3.5 text-amber-500" />}
                </p>
                <p className="font-mono text-[11px]" dir="ltr">
                  {a.sheba}
                </p>
                {a.rejectionReason && <p className="text-[11px] text-red-600">دلیل رد: {a.rejectionReason}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge map={BANK_ACCOUNT_STATUS} value={a.status} />
                {a.status === "VERIFIED" && !a.isDefault && (
                  <button type="button" disabled={busy} onClick={() => act(() => axios.post(`/api/agent-portal/bank-accounts/${a.id}/default`))} className="text-[11px] font-bold text-gray-600">
                    پیش‌فرض
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => confirm("این حساب حذف شود؟") && act(() => axios.post(`/api/agent-portal/bank-accounts/${a.id}/archive`))}
                  className="text-red-500"
                  aria-label="حذف حساب"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
