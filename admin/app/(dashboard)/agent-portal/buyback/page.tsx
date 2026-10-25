// admin/app/(dashboard)/agent-portal/buyback/page.tsx
//
// فروش شمش ملکی نماینده به شرکت: انتخاب شمش‌ها ← پیش‌نمایش قیمت خرید ← ثبت (قیمت قفل) ←
// تحویل فیزیکی و بازرسی ← ثبت شماره صورتحساب الکترونیک نماینده به نام شرکت ← تسویه به کیف پول
// یا حساب بانکی تأییدشده. در این معامله نماینده فروشنده است و صورتحساب را خودش صادر می‌کند.
"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { HandCoins, Loader2, Printer } from "lucide-react";
import {
  Alert,
  Badge,
  Empty,
  Field,
  Pagination,
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
import JalaliDateInput from "@/app/components/JalaliDateInput";
import { BUYBACK_STATUS, type AgentBankAccount, type BuybackOrder } from "@/app/components/agents/trading";

interface OwnedBar {
  id: string;
  code: string;
  weightGrams: string;
  purityKarat: string;
  factorySerialNumber: string | null;
}

interface Quote {
  items: { code: string; weightGrams: string; pricePerGramRial: string; amountRial: string }[];
  totalRial: string;
}

export default function AgentBuybackPage() {
  const { data: inv, mutate: refreshInv } = useSWR<{ data: OwnedBar[] }>("/api/agent-portal/inventory?source=OWNED&page=1&limit=200", fetcher);
  const { data: accounts } = useSWR<AgentBankAccount[]>("/api/agent-portal/bank-accounts", fetcher);
  const [page, setPage] = useState(1);
  const { data: orders, mutate } = useSWR<{ data: BuybackOrder[]; page: number; totalPages: number }>(
    `/api/agent-portal/buybacks?page=${page}&limit=10`,
    fetcher,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [payout, setPayout] = useState<"WALLET" | "BANK">("WALLET");
  const [bankAccountId, setBankAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const verified = (accounts ?? []).filter((a) => a.status === "VERIFIED");
  const toggle = (code: string) => {
    setQuote(null);
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));
  };

  const run = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await fn()) as { data?: { message?: string } };
      if (r?.data?.message) setMsg({ kind: "success", text: r.data.message });
      after?.();
    } catch (err) {
      setMsg({ kind: "error", text: getErrorMessage(err, "عملیات ناموفق بود") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <HandCoins className="w-5 h-5" /> فروش شمش به شرکت
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          شمش‌های ملکی خود (خریداری‌شده از شرکت، با بسته‌بندی و هولوگرام سالم) را به آرکان گلد بفروشید. قیمت هنگام ثبت قفل می‌شود و پس از
          تحویل و بازرسی تسویه می‌گردد. در این معامله شما فروشنده‌اید و باید صورتحساب الکترونیک را به نام شرکت در سامانه مؤدیان صادر کنید.
        </p>
      </div>

      {msg && <Alert kind={msg.kind} text={msg.text} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl p-4" style={cardStyle}>
          <h2 className="text-[14px] font-black text-gray-800 mb-3">شمش‌های ملکی شما</h2>
          {!inv ? (
            <Spinner />
          ) : !inv.data.length ? (
            <Empty text="شمش ملکی آماده‌ی فروش ندارید" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {inv.data.map((b) => (
                <label
                  key={b.id}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border-2 cursor-pointer text-[12px] ${selected.includes(b.code) ? "border-emerald-700 bg-emerald-50" : "border-gray-100"}`}
                >
                  <input type="checkbox" checked={selected.includes(b.code)} onChange={() => toggle(b.code)} />
                  <span className="font-mono font-black" dir="ltr">
                    {b.code}
                  </span>
                  <span className="text-gray-500">
                    {faNum(b.weightGrams, 4)} گرم — {PURITY_FA[b.purityKarat] ?? b.purityKarat}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl p-4 space-y-3 h-fit" style={cardStyle}>
          <h2 className="text-[14px] font-black text-gray-800">ثبت درخواست فروش</h2>
          <p className="text-[12px]">انتخاب‌شده: {faNum(selected.length)} شمش</p>
          <button
            type="button"
            disabled={busy || !selected.length}
            onClick={() =>
              run(async () => {
                const { data } = await axios.post<Quote>("/api/agent-portal/buybacks/quote", { codes: selected });
                setQuote(data);
              })
            }
            className={`${secondaryBtn} w-full`}
          >
            پیش‌نمایش قیمت خرید
          </button>
          {quote && (
            <div className="rounded-xl bg-gray-50 p-3 text-[12px]">
              {quote.items.map((q) => (
                <p key={q.code} className="flex justify-between">
                  <span dir="ltr">{q.code}</span>
                  <span>{toman(q.amountRial)} ت</span>
                </p>
              ))}
              <p className="font-black text-[14px] mt-2">جمع: {toman(quote.totalRial)} تومان</p>
            </div>
          )}
          <Field label="روش تسویه">
            <select className={inputCls} value={payout} onChange={(e) => setPayout(e.target.value as "WALLET" | "BANK")}>
              <option value="WALLET">واریز به کیف پول نمایندگی</option>
              <option value="BANK">واریز به حساب بانکی تأییدشده</option>
            </select>
          </Field>
          {payout === "BANK" && (
            <Field label="حساب مقصد">
              <select className={inputCls} value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">انتخاب کنید</option>
                {verified.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.bankName} — {a.sheba}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button
            type="button"
            disabled={busy || !selected.length || (payout === "BANK" && !bankAccountId)}
            onClick={() =>
              run(
                () =>
                  axios.post("/api/agent-portal/buybacks", {
                    codes: selected,
                    payoutMethod: payout,
                    bankAccountId: payout === "BANK" ? bankAccountId : undefined,
                  }),
                () => {
                  setSelected([]);
                  setQuote(null);
                  void refreshInv();
                  void mutate();
                },
              )
            }
            className={`${primaryBtn} w-full`}
            style={primaryBtnStyle}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "ثبت و قفل قیمت"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <h2 className="text-[14px] font-black text-gray-800 mb-3">درخواست‌های فروش به شرکت</h2>
        {!orders?.data.length ? (
          <Empty text="درخواستی ثبت نشده است" />
        ) : (
          <div className="space-y-2">
            {orders.data.map((o) => (
              <BuybackRow
                key={o.id}
                order={o}
                open={openId === o.id}
                onToggle={() => setOpenId(openId === o.id ? null : o.id)}
                onChange={() => {
                  void mutate();
                  void refreshInv();
                }}
              />
            ))}
            <Pagination page={orders.page} totalPages={orders.totalPages} onChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
}

function BuybackRow({
  order,
  open,
  onToggle,
  onChange,
}: {
  order: BuybackOrder;
  open: boolean;
  onToggle: () => void;
  onChange: () => void;
}) {
  const { data: detail, mutate } = useSWR<BuybackOrder>(open ? `/api/agent-portal/buybacks/${order.id}` : null, fetcher);
  const [invNo, setInvNo] = useState("");
  const [invDate, setInvDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const post = async (url: string, body?: unknown) => {
    setBusy(true);
    setMsg(null);
    try {
      await axios.post(url, body ?? {});
      void mutate();
      onChange();
    } catch (err) {
      setMsg(getErrorMessage(err, "عملیات ناموفق بود"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-100">
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-2 p-3 text-[12px] text-right">
        <span className="font-black" dir="ltr">
          {order.orderNumber}
        </span>
        <span>{faNum(order.totalWeightGrams, 4)} گرم</span>
        <span className="font-bold">{toman(order.finalTotalRial ?? order.quotedTotalRial)} ت</span>
        <Badge map={BUYBACK_STATUS} value={order.status} />
      </button>
      {open && (
        <div className="border-t border-gray-100 p-3 space-y-3 text-[12px]">
          {!detail ? (
            <Spinner />
          ) : (
            <>
              {detail.status === "PENDING_DELIVERY" && (
                <Alert kind="warn" text={`شمش‌ها را تا ${faDateTime(detail.deliveryDeadline)} به شرکت تحویل دهید؛ پس از آن درخواست لغو و شمش‌ها به موجودی شما برمی‌گردد.`} />
              )}
              <div className="flex flex-wrap gap-2">
                {detail.items?.map((i) => (
                  <span key={i.id} className={`px-2 py-1 rounded-lg text-[11px] ${i.accepted ? "bg-gray-50" : "bg-red-50 text-red-600 line-through"}`} dir="ltr">
                    {i.code} · {toman(i.finalRial ?? i.quotedRial)}
                  </span>
                ))}
              </div>
              {detail.inspectionNote && <p className="text-gray-600">نتیجه‌ی بازرسی: {detail.inspectionNote}</p>}
              {detail.rejectionReason && <p className="text-red-600">{detail.rejectionReason}</p>}
              <p>
                تسویه: {detail.payoutMethod === "WALLET" ? "کیف پول نمایندگی" : `حساب ${detail.bankAccount?.bankName ?? ""} ${detail.bankAccount?.sheba ?? ""}`}
              </p>
              {detail.agentInvoiceNumber ? (
                <p className="text-green-700">
                  صورتحساب شما: <bdi dir="ltr">{detail.agentInvoiceNumber}</bdi> ({faDateTime(detail.agentInvoiceDate)})
                </p>
              ) : (
                ["PENDING_DELIVERY", "RECEIVED", "APPROVED"].includes(detail.status) && (
                  <div className="grid gap-2 sm:grid-cols-3 items-end rounded-xl bg-gray-50 p-3">
                    <Field label="شماره صورتحساب (سامانه مؤدیان)">
                      <input className={inputCls} dir="ltr" value={invNo} onChange={(e) => setInvNo(e.target.value)} />
                    </Field>
                    <Field label="تاریخ صورتحساب">
                      <JalaliDateInput value={invDate} onChange={setInvDate} />
                    </Field>
                    <button
                      type="button"
                      disabled={busy || invNo.trim().length < 4 || !invDate}
                      onClick={() => post(`/api/agent-portal/buybacks/${order.id}/agent-invoice`, { agentInvoiceNumber: invNo, agentInvoiceDate: invDate })}
                      className={primaryBtn}
                      style={primaryBtnStyle}
                    >
                      ثبت صورتحساب
                    </button>
                  </div>
                )
              )}
              {detail.voucherNumber && (
                <a href={`/agent-docs/voucher/${encodeURIComponent(detail.voucherNumber)}?scope=agent`} target="_blank" rel="noreferrer" className={secondaryBtn}>
                  <Printer className="w-4 h-4" /> حواله تحویل به شرکت
                </a>
              )}
              {msg && <Alert kind="error" text={msg} />}
              {detail.status === "PENDING_DELIVERY" && (
                <button type="button" disabled={busy} onClick={() => confirm("درخواست لغو شود؟") && post(`/api/agent-portal/buybacks/${order.id}/cancel`)} className="text-[12px] font-bold text-red-600">
                  لغو درخواست
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
