// admin/app/(dashboard)/accounting/page.tsx — داشبورد مالی
"use client";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  Boxes,
  Coins,
  FileText,
  Handshake,
  Landmark,
  LayoutDashboard,
  Scale,
  ShieldCheck,
  Store,
  Vault,
  Wallet,
} from "lucide-react";
import { Alert, Kpi, PageHeader, Spinner, cardStyle, fetcher, grams, signedToman, toman } from "@/app/components/finance/ui";

interface Bal {
  rial: string;
  grams: string;
}
interface Dashboard {
  cash: Bal;
  userRialLiability: Bal;
  agentReceivable: Bal;
  partnerReceivable: Bal;
  supplierPayable: Bal;
  taxPayable: Bal;
  bullionVault: Bal;
  bullionAtAgents: Bal;
  goldPosition: {
    pricePerGramRial: string;
    walletGoldGrams: string;
    netMeltedPositionGrams: string;
    netMeltedPositionRial: string;
    meltedGold: { code: string; name: string; grams: string; bookValueRial: string }[];
  };
  monthToDate: { netSalesRial: string; grossProfitRial: string; netProfitRial: string; feeIncomeRial: string };
  pendingManualVouchers: number;
  openTreasuryOrders: number;
  overduePartnerOrders: { count: number; amountRial: string };
}

const LINKS = [
  { href: "/treasury", label: "گزارش پوشش و خرید طلا", icon: Vault },
  { href: "/inventory/bullion", label: "موجودی لحظه‌ای شمش", icon: Boxes },
  { href: "/accounting/journal", label: "دفتر روزنامه", icon: FileText },
  { href: "/accounting/vouchers", label: "اسناد دستی", icon: FileText },
  { href: "/accounting/trial-balance", label: "تراز آزمایشی", icon: Scale },
  { href: "/accounting/reports", label: "صورت‌های مالی", icon: BarChart3 },
  { href: "/accounting/reconciliation", label: "مغایرت‌گیری", icon: ShieldCheck },
  { href: "/partners", label: "شرکای فروش اقساطی", icon: Handshake },
];

export default function AccountingDashboardPage() {
  const { data, isLoading } = useSWR<Dashboard>("/api/admin/accounting/dashboard", fetcher, {
    refreshInterval: 60_000,
  });
  const vault = data?.goldPosition.meltedGold.find((r) => r.code === "1020");
  const inTransit = data?.goldPosition.meltedGold.find((r) => r.code === "1060");
  const net = Number(data?.goldPosition.netMeltedPositionGrams ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={LayoutDashboard}
        title="داشبورد مالی"
        subtitle="وضعیت لحظه‌ای نقدینگی، بدهی‌ها و طلای کاربران، پوشش خزانه، مطالبات و سود و زیان ماه جاری"
      />
      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="space-y-2">
            {net < 0 && (
              <Alert
                kind="error"
                text={`کسری پوشش طلای آب‌شده: ${grams(Math.abs(net))} گرم از طلای کیف پول کاربران پشتوانه‌ی فیزیکی ندارد. از «گزارش پوشش و خرید» درخواست خرید ثبت کنید.`}
              />
            )}
            {data.overduePartnerOrders.count > 0 && (
              <Alert
                kind="warn"
                text={`${data.overduePartnerOrders.count.toLocaleString("fa-IR")} سفارش شرکای فروش از سررسید تسویه گذشته است (${toman(
                  data.overduePartnerOrders.amountRial,
                )} تومان).`}
              />
            )}
            {data.pendingManualVouchers > 0 && (
              <Alert kind="info" text={`${data.pendingManualVouchers.toLocaleString("fa-IR")} سند دستی در انتظار تأیید است.`} />
            )}
          </div>

          <h2 className="text-[13px] font-black text-gray-700">طلای آب‌شده (گرم ۷۵۰)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="طلای کیف پول کاربران (بدهی)" value={`${grams(data.goldPosition.walletGoldGrams)} گرم`} icon={Wallet} color="#dc2626" />
            <Kpi
              title="موجودی خزانه"
              value={`${grams(vault?.grams)} گرم`}
              hint={`بهای دفتری ${toman(vault?.bookValueRial)} تومان`}
              icon={Vault}
            />
            <Kpi title="خریداری‌شده در راه" value={`${grams(inTransit?.grams)} گرم`} icon={Coins} color="#d97706" />
            <Kpi
              title={net >= 0 ? "مازاد پوشش" : "کسری پوشش"}
              value={`${grams(Math.abs(net))} گرم`}
              hint={`${toman(Math.abs(Number(data.goldPosition.netMeltedPositionRial)))} تومان به قیمت روز`}
              icon={net >= 0 ? ShieldCheck : AlertTriangle}
              color={net >= 0 ? "var(--color-emerald)" : "#dc2626"}
            />
          </div>

          <h2 className="text-[13px] font-black text-gray-700">نقدینگی، بدهی‌ها و مطالبات (تومان)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="موجودی نقد و بانک" value={signedToman(data.cash.rial)} icon={Banknote} />
            <Kpi title="بدهی ریالی به کاربران" value={signedToman(data.userRialLiability.rial)} icon={Wallet} color="#dc2626" />
            <Kpi title="طلب از شرکای فروش" value={signedToman(data.partnerReceivable.rial)} icon={Handshake} color="#0d9488" />
            <Kpi title="طلب از نمایندگان" value={signedToman(data.agentReceivable.rial)} icon={Store} color="#2563eb" />
            <Kpi title="بدهی به تأمین‌کنندگان طلا" value={signedToman(data.supplierPayable.rial)} icon={Landmark} color="#dc2626" />
            <Kpi title="مالیات پرداختنی" value={signedToman(data.taxPayable.rial)} icon={Landmark} color="#7c3aed" />
            <Kpi title="شمش خزانه" value={`${grams(data.bullionVault.grams)} گرم`} hint={`${toman(data.bullionVault.rial)} تومان`} icon={Boxes} />
            <Kpi
              title="شمش امانی نزد نمایندگان"
              value={`${grams(data.bullionAtAgents.grams)} گرم`}
              hint={`${toman(data.bullionAtAgents.rial)} تومان`}
              icon={Store}
              color="#2563eb"
            />
          </div>

          <h2 className="text-[13px] font-black text-gray-700">عملکرد ماه جاری (تومان)</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="فروش خالص" value={signedToman(data.monthToDate.netSalesRial)} icon={BarChart3} />
            <Kpi title="سود ناخالص" value={signedToman(data.monthToDate.grossProfitRial)} icon={BarChart3} />
            <Kpi title="درآمد کارمزد معاملات" value={signedToman(data.monthToDate.feeIncomeRial)} icon={Coins} />
            <Kpi
              title="سود (زیان) خالص"
              value={signedToman(data.monthToDate.netProfitRial)}
              icon={BarChart3}
              color={Number(data.monthToDate.netProfitRial) >= 0 ? "var(--color-emerald)" : "#dc2626"}
            />
          </div>

          <div className="rounded-2xl p-4" style={cardStyle}>
            <p className="text-[12px] font-black text-gray-700 mb-3">دسترسی سریع</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 bg-white text-[12px] font-bold text-gray-700 hover:border-gray-300"
                >
                  <l.icon className="w-4 h-4 text-gray-400" /> {l.label}
                </Link>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">
              قیمت مبنای ارزش‌گذاری: {toman(data.goldPosition.pricePerGramRial)} تومان برای هر گرم ۱۸ عیار — سفارش‌های خزانه‌ی باز:{" "}
              {data.openTreasuryOrders.toLocaleString("fa-IR")}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
