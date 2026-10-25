// admin/app/(dashboard)/agent-portal/page.tsx
"use client";
import Link from "next/link";
import useSWR from "swr";
import { Boxes, Wallet, Coins, HandCoins, ShoppingCart, FileSpreadsheet, Receipt, ArrowLeft, Store, ShoppingBag, PiggyBank, ReceiptText } from "lucide-react";
import { useAdminMe } from "@/app/hooks/useAdminMe";
import {
  Alert,
  Badge,
  Empty,
  Kpi,
  SALE_STATUS,
  Spinner,
  cardStyle,
  commissionLabel,
  faDateTime,
  faNum,
  fetcher,
  toman,
} from "@/app/components/agents/ui";

interface Summary {
  agent: {
    code: string;
    name: string;
    status: string;
    commissionType: string;
    commissionValue: string;
    consignmentEnabled: boolean;
    creditPurchaseEnabled: boolean;
  };
  /** امانی (ملک شرکت) */
  stock: { count: number; grams: string };
  /** ملکی (خریداری‌شده از شرکت با صورتحساب به نام نماینده) */
  ownedStock: { count: number; grams: string };
  wallet: { balanceRial: string; blockedRial: string; availableRial: string };
  openPurchaseOrders: number;
  balanceRial: string;
  creditLimitRial: string | null;
  availableCreditRial: string | null;
  sales: { count: number; totalRial: string; commissionRial: string; netPayableRial: string; grams: string };
  salesThisMonth: { count: number; totalRial: string; commissionRial: string; grams: string };
  settlements: { approvedCount: number; approvedRial: string; pendingCount: number; pendingRial: string };
}

interface RecentSale {
  id: string;
  saleNumber: string;
  status: string;
  buyerFullName: string;
  hologramCode: { code: string };
  weightGrams: string;
  totalRial: string;
  commissionRial: string;
  createdAt: string;
}

export default function AgentPortalHome() {
  const { me } = useAdminMe();
  const { data, isLoading, error } = useSWR<Summary>(me?.agent ? "/api/agent-portal/summary" : null, fetcher);
  const { data: recent } = useSWR<{ data: RecentSale[] }>(
    me?.agent ? "/api/agent-portal/sales?page=1&limit=5" : null,
    fetcher,
  );

  if (me && !me.agent)
    return <Alert kind="warn" text="این حساب به هیچ نماینده‌ای متصل نیست. پرتال نمایندگی فقط برای حساب‌های نمایندگان فعال است." />;
  if (error) return <Alert kind="error" text="دریافت اطلاعات نمایندگی ممکن نشد" />;
  if (isLoading || !data) return <Spinner />;

  const canSell = me?.permissions.includes("agent_portal.sell") && data.agent.status === "ACTIVE";
  const balance = Number(data.balanceRial);

  return (
    <div className="space-y-5">
      <div
        className="relative overflow-hidden rounded-2xl p-6"
        style={{ background: "linear-gradient(135deg, var(--color-emerald), #1a0204)" }}
      >
        <div className="relative z-10 flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-[12px] text-white/50 font-medium mb-1 flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> پنل نمایندگی · <span dir="ltr">{data.agent.code}</span>
            </p>
            <h1 className="text-[20px] font-black text-white">{data.agent.name}</h1>
            {data.agent.consignmentEnabled && (
              <p className="text-[12px] text-white/60 mt-1">
                حق‌العمل فروش امانی: {commissionLabel(data.agent.commissionType, data.agent.commissionValue)}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {data.agent.status === "ACTIVE" && me?.permissions.includes("agent_portal.purchase") && (
              <Link
                href="/agent-portal/purchase"
                className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[14px] font-black bg-white/10 text-white border border-white/20"
              >
                <ShoppingBag className="w-5 h-5" /> خرید شمش از شرکت
              </Link>
            )}
            {canSell && (
              <Link
                href="/agent-portal/sell"
                className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[14px] font-black"
                style={{ backgroundColor: "var(--color-gold-500)", color: "var(--color-emerald)" }}
              >
                <ShoppingCart className="w-5 h-5" /> ثبت فروش و اصالت
              </Link>
            )}
          </div>
        </div>
      </div>

      {data.agent.status !== "ACTIVE" && (
        <Alert
          kind="warn"
          text="حساب نمایندگی شما در حال حاضر تعلیق است. تا رفع تعلیق فقط امکان مشاهده وجود دارد؛ برای پیگیری با واحد مالی تماس بگیرید."
        />
      )}
      {data.availableCreditRial !== null && Number(data.availableCreditRial) <= 0 && (
        <Alert kind="error" text="سقف اعتبار شما تکمیل شده است. برای ادامه‌ی فروش، ابتدا بدهی خود را تسویه کنید." />
      )}

      <Alert
        kind="info"
        text="شمش‌هایی که از شرکت می‌خرید با صورتحساب به نام شما صادر می‌شود. هنگام فروش به مشتری، فاکتور را خودتان (با کد اقتصادی خود در سامانه مؤدیان) صادر کنید؛ آرکان گلد فقط اصالت و مالکیت شمش را به نام مشتری ثبت می‌کند."
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi
          title="موجودی شمش ملکی شما"
          icon={Boxes}
          color="#7e22ce"
          value={`${faNum(data.ownedStock.count)} شمش`}
          hint={`${faNum(data.ownedStock.grams, 4)} گرم — خریداری‌شده از شرکت`}
        />
        <Kpi
          title="کیف پول نمایندگی"
          icon={PiggyBank}
          color="#0f766e"
          value={`${toman(data.wallet.availableRial)} تومان`}
          hint={Number(data.wallet.blockedRial) > 0 ? `${toman(data.wallet.blockedRial)} تومان رزرو برداشت` : "قابل استفاده برای خرید یا برداشت"}
        />
        {(data.agent.consignmentEnabled || data.stock.count > 0) && (
          <Kpi title="موجودی امانی (ملک شرکت)" icon={Boxes} color="#0369a1" value={`${faNum(data.stock.count)} شمش`} hint={`${faNum(data.stock.grams, 4)} گرم`} />
        )}
        <Kpi
          title="بدهی شما به شرکت"
          icon={Wallet}
          color={balance > 0 ? "#b91c1c" : "#15803d"}
          value={`${toman(data.balanceRial)} تومان`}
          hint={data.creditLimitRial ? `سقف ${toman(data.creditLimitRial)} · باقی‌مانده ${toman(data.availableCreditRial)}` : "بدون سقف اعتبار"}
        />
        <Kpi
          title="فروش این ماه"
          icon={Coins}
          color="#c5a059"
          value={`${toman(data.salesThisMonth.totalRial)} تومان`}
          hint={`${faNum(data.salesThisMonth.count)} شمش ثبت‌شده به نام مشتری`}
        />
        <Kpi
          title="سفارش‌های خرید باز"
          icon={ShoppingBag}
          value={`${faNum(data.openPurchaseOrders)} سفارش`}
          hint={`${faNum(data.sales.count)} فروش ثبت‌شده به مشتریان`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { href: "/agent-portal/purchase", icon: ShoppingBag, title: "خرید شمش", sub: "قیمت لحظه‌ای نمایندگی و ثبت سفارش" },
          { href: "/agent-portal/wallet", icon: Wallet, title: "کیف پول و حساب بانکی", sub: "واریز، برداشت و حساب‌های تأییدشده" },
          { href: "/agent-portal/buyback", icon: HandCoins, title: "فروش شمش به شرکت", sub: "فروش شمش‌های ملکی به آرکان گلد" },
          { href: "/agent-portal/inventory", icon: Boxes, title: "موجودی شمش", sub: "ملکی و امانی" },
          { href: "/agent-portal/invoices", icon: ReceiptText, title: "صورتحساب‌های شرکت", sub: "فاکتورها و پیش‌فاکتورهای به نام شما" },
          { href: "/agent-portal/statement", icon: FileSpreadsheet, title: "صورتحساب معین", sub: data.settlements.pendingCount ? `${faNum(data.settlements.pendingCount)} اعلام واریز در انتظار تأیید` : "بدهی امانی/اعتباری و تسویه" },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="flex items-center gap-3 p-4 rounded-2xl hover:bg-gray-50" style={cardStyle}>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: "var(--color-emerald-light)", color: "var(--color-emerald)" }}>
              <l.icon className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-black text-gray-800">{l.title}</p>
              <p className="text-[11px] text-gray-400">{l.sub}</p>
            </div>
            <ArrowLeft className="w-4 h-4 text-gray-300" />
          </Link>
        ))}
      </div>

      <div className="rounded-2xl p-4" style={cardStyle}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-black text-gray-800 flex items-center gap-2">
            <Receipt className="w-4 h-4" /> آخرین فروش‌ها
          </h2>
          <Link href="/agent-portal/sales" className="text-[12px] font-bold" style={{ color: "var(--color-emerald)" }}>
            همه فروش‌ها
          </Link>
        </div>
        {!recent?.data.length ? (
          <Empty text="هنوز فروشی ثبت نکرده‌اید" />
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full min-w-[560px]">
              <tbody>
                {recent.data.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <p className="font-bold" dir="ltr">
                        {s.saleNumber}
                      </p>
                      <p className="text-[11px] text-gray-400">{faDateTime(s.createdAt)}</p>
                    </td>
                    <td>
                      {s.buyerFullName}
                      <p className="text-[11px] text-gray-400 font-mono">{s.hologramCode.code}</p>
                    </td>
                    <td>{faNum(s.weightGrams)} گرم</td>
                    <td className="font-bold">{toman(s.totalRial)} ت</td>
                    <td>
                      <Badge map={SALE_STATUS} value={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
