// admin/app/(dashboard)/agents/trading/page.tsx
//
// کارتابل خرید و فروش قطعی نمایندگان: سفارش‌های خرید (تأیید، تخصیص شمش، صورتحساب و حواله)،
// واریزهای بانکی، برداشت‌ها، تأیید حساب‌های بانکی، فروش شمش نماینده به شرکت و فهرست قیمت.
"use client";
import { useState } from "react";
import useSWR from "swr";
import { ClipboardList } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import { Empty, Pagination, Spinner, cardStyle, faNum, fetcher, inputCls, toman } from "@/app/components/agents/ui";
import {
  BankAccountRow,
  BuybacksTable,
  DepositsTable,
  PriceItemsPanel,
  PurchaseOrdersTable,
  WithdrawalsTable,
} from "@/app/components/agents/TradingPanels";
import { BANK_ACCOUNT_STATUS, type AgentBankAccount } from "@/app/components/agents/trading";

type Tab = "orders" | "deposits" | "withdrawals" | "banks" | "buybacks" | "prices";

interface Overview {
  ordersAwaitingApproval: number;
  ordersAwaitingPaymentReview: number;
  depositsAwaitingReview: number;
  withdrawalsPending: number;
  withdrawalsAwaitingPayout: number;
  bankAccountsPending: number;
  buybacksAwaitingDelivery: number;
  agentWallets: { balanceRial: string; blockedRial: string };
}

export default function AgentTradingDeskPage() {
  const { me } = useAdminMe();
  const perm = (p: string) => me?.permissions.includes(p) ?? false;
  const [tab, setTab] = useState<Tab>("orders");
  const { data: ov } = useSWR<Overview>("/api/admin/agents/trading/overview", fetcher, { refreshInterval: 60_000 });

  const count = (n?: number) => (n ? ` (${faNum(n)})` : "");
  const TABS: { key: Tab; label: string }[] = [
    { key: "orders", label: `سفارش‌های خرید${count((ov?.ordersAwaitingApproval ?? 0) + (ov?.ordersAwaitingPaymentReview ?? 0))}` },
    { key: "deposits", label: `واریزهای بانکی${count(ov?.depositsAwaitingReview)}` },
    { key: "withdrawals", label: `برداشت‌ها${count((ov?.withdrawalsPending ?? 0) + (ov?.withdrawalsAwaitingPayout ?? 0))}` },
    { key: "banks", label: `حساب‌های بانکی${count(ov?.bankAccountsPending)}` },
    { key: "buybacks", label: `خرید از نماینده${count(ov?.buybacksAwaitingDelivery)}` },
    { key: "prices", label: "فهرست قیمت نمایندگی" },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-5 h-5" /> کارتابل خرید و فروش نمایندگان
        </h1>
        <p className="text-[12px] text-gray-400 mt-1">
          فروش قطعی شمش به نمایندگان (صورتحساب به نام نماینده، حواله پس از تأیید پرداخت)، کیف پول ریالی نمایندگان و خرید شمش از نمایندگان.
        </p>
      </div>

      {ov && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[12px]">
          {[
            ["پرداخت‌شده — منتظر تأیید و تخصیص", ov.ordersAwaitingApproval],
            ["واریز اعلام‌شده — منتظر تطبیق", ov.ordersAwaitingPaymentReview + ov.depositsAwaitingReview],
            ["برداشت در انتظار تأیید/پرداخت", ov.withdrawalsPending + ov.withdrawalsAwaitingPayout],
            ["حساب بانکی منتظر تأیید", ov.bankAccountsPending],
          ].map(([label, n]) => (
            <div key={label as string} className="rounded-2xl p-4" style={cardStyle}>
              <p className="text-gray-500">{label}</p>
              <p className="text-[20px] font-black mt-1">{faNum(n as number)}</p>
            </div>
          ))}
          <div className="col-span-2 lg:col-span-4 rounded-2xl p-4" style={cardStyle}>
            جمع کیف پول نمایندگان (باید با مانده‌ی حساب ۲۰۷۰ برابر باشد): <b>{toman(ov.agentWallets.balanceRial)} تومان</b>
            {Number(ov.agentWallets.blockedRial) > 0 && <> — رزرو برداشت: {toman(ov.agentWallets.blockedRial)} تومان</>}
          </div>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap border ${
              tab === t.key ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200"
            }`}
            style={tab === t.key ? { backgroundColor: "var(--color-emerald)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl p-4 sm:p-5" style={cardStyle}>
        {tab === "orders" && <PurchaseOrdersTable status="PAID" />}
        {tab === "deposits" && <DepositsTable canManage={perm("agent.funds.manage")} />}
        {tab === "withdrawals" && <WithdrawalsTable canManage={perm("agent.funds.manage")} />}
        {tab === "banks" && <BankAccountsQueue canReview={perm("agent.funds.manage")} />}
        {tab === "buybacks" && <BuybacksTable canManage={perm("agent.buyback.manage")} canPay={perm("agent.funds.manage")} />}
        {tab === "prices" && <PriceItemsPanel canManage={perm("agent.order.manage")} />}
      </div>
    </div>
  );
}

function BankAccountsQueue({ canReview }: { canReview: boolean }) {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("PENDING");
  const { data, mutate } = useSWR<{
    data: (AgentBankAccount & { agent: { id: string; code: string; name: string; managerName: string } })[];
    page: number;
    totalPages: number;
  }>(`/api/admin/agents/trading/bank-accounts?page=${page}&limit=20&status=${status}`, fetcher);
  return (
    <div className="space-y-3">
      <select
        className={`${inputCls} max-w-xs mt-0`}
        value={status}
        onChange={(e) => {
          setStatus(e.target.value);
          setPage(1);
        }}
      >
        {Object.entries(BANK_ACCOUNT_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </select>
      {!data ? (
        <Spinner />
      ) : !data.data.length ? (
        <Empty text="حسابی در این وضعیت نیست" />
      ) : (
        data.data.map((a) => (
          <BankAccountRow key={a.id} account={a} agent={a.agent} canReview={canReview} onChanged={() => void mutate()} />
        ))
      )}
      {data && <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />}
    </div>
  );
}
