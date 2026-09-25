// admin/app/(dashboard)/agents/reports/page.tsx
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { BarChart3, Download, Printer } from "lucide-react";
import {
  AGENT_STATUS,
  Badge,
  Empty,
  Kpi,
  Spinner,
  cardStyle,
  downloadCsv,
  faNum,
  fetcher,
  secondaryBtn,
  toman,
} from "@/app/components/agents/ui";

interface ReportRow {
  agent: { id: string; code: string; name: string; city: string | null; status: string };
  salesCount: number;
  voidedCount: number;
  gramsSold: string;
  totalRial: string;
  goldValueRial: string;
  premiumRial: string;
  commissionRial: string;
  netPayableRial: string;
  settledCount: number;
  settledRial: string;
  allocatedCount: number;
  allocatedGrams: string;
  returnedCount: number;
  returnedGrams: string;
  stockCount: number;
  stockGrams: string;
  balanceRial: string;
  creditLimitRial: string | null;
}

interface Report {
  rows: ReportRow[];
  totals: {
    salesCount: number;
    voidedCount: number;
    gramsSold: string;
    totalRial: string;
    commissionRial: string;
    netPayableRial: string;
    settledRial: string;
    stockCount: number;
    stockGrams: string;
    balanceRial: string;
  };
}

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function AgentReportsPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading } = useSWR<Report>(`/api/admin/agents/reports/performance?${qs.toString()}`, fetcher);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(
      `agents-performance-${from || "all"}-${to || "now"}.csv`,
      [
        "کد",
        "نماینده",
        "شهر",
        "وضعیت",
        "تعداد فروش",
        "ابطال",
        "گرم فروخته‌شده",
        "مبلغ فروش (ریال)",
        "ارزش طلا (ریال)",
        "اجرت (ریال)",
        "حق‌العمل (ریال)",
        "سهم شرکت (ریال)",
        "تسویه دریافتی (ریال)",
        "تحویل امانی (عدد)",
        "عودت (عدد)",
        "موجودی فعلی (عدد)",
        "موجودی فعلی (گرم)",
        "بدهی فعلی (ریال)",
      ],
      data.rows.map((r) => [
        r.agent.code,
        r.agent.name,
        r.agent.city,
        AGENT_STATUS[r.agent.status]?.label ?? r.agent.status,
        r.salesCount,
        r.voidedCount,
        r.gramsSold,
        r.totalRial,
        r.goldValueRial,
        r.premiumRial,
        r.commissionRial,
        r.netPayableRial,
        r.settledRial,
        r.allocatedCount,
        r.returnedCount,
        r.stockCount,
        r.stockGrams,
        r.balanceRial,
      ]),
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-black text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" /> گزارش عملکرد نمایندگان
          </h1>
          <p className="text-[12px] text-gray-400 mt-1">
            فروش، حق‌العمل، تسویه و گردش موجودی امانی در بازه‌ی انتخابی؛ موجودی و بدهی، وضعیت لحظه‌ی فعلی است
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap print:hidden">
          <label className="text-[11px] font-bold text-gray-500">
            از
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" dir="ltr" />
          </label>
          <label className="text-[11px] font-bold text-gray-500">
            تا
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="block mt-1 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white" dir="ltr" />
          </label>
          <button type="button" onClick={exportCsv} className={secondaryBtn}>
            <Download className="w-4 h-4" /> اکسل
          </button>
          <button type="button" onClick={() => window.print()} className={secondaryBtn}>
            <Printer className="w-4 h-4" /> چاپ
          </button>
        </div>
      </div>

      {isLoading || !data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi title="فروش قطعی در بازه" value={`${faNum(data.totals.salesCount)} شمش`} hint={`${faNum(data.totals.gramsSold, 4)} گرم · ${faNum(data.totals.voidedCount)} ابطال`} />
            <Kpi title="مبلغ فروش" color="#c5a059" value={`${toman(data.totals.totalRial)} تومان`} hint={`سهم شرکت: ${toman(data.totals.netPayableRial)}`} />
            <Kpi title="حق‌العمل نمایندگان" color="#b45309" value={`${toman(data.totals.commissionRial)} تومان`} />
            <Kpi title="تسویه دریافتی در بازه" color="#15803d" value={`${toman(data.totals.settledRial)} تومان`} hint={`مطالبات فعلی: ${toman(data.totals.balanceRial)} · موجودی امانی: ${faNum(data.totals.stockCount)} شمش`} />
          </div>

          <div className="rounded-2xl p-4" style={cardStyle}>
            {!data.rows.length ? (
              <Empty text="نماینده‌ای تعریف نشده است" />
            ) : (
              <div className="overflow-x-auto">
                <table className="admin-table w-full min-w-[1100px]">
                  <thead>
                    <tr>
                      <th>نماینده</th>
                      <th>فروش</th>
                      <th>گرم</th>
                      <th>مبلغ فروش</th>
                      <th>حق‌العمل</th>
                      <th>سهم شرکت</th>
                      <th>تسویه</th>
                      <th>تحویل / عودت</th>
                      <th>موجودی فعلی</th>
                      <th>بدهی فعلی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.agent.id}>
                        <td>
                          <Link href={`/agents/${r.agent.id}`} className="font-black text-gray-900 hover:underline">
                            {r.agent.name}
                          </Link>
                          <p className="text-[10px] text-gray-400">
                            <span dir="ltr">{r.agent.code}</span> · <Badge map={AGENT_STATUS} value={r.agent.status} />
                          </p>
                        </td>
                        <td>
                          {faNum(r.salesCount)}
                          {r.voidedCount > 0 && <p className="text-[10px] text-red-500">{faNum(r.voidedCount)} ابطال</p>}
                        </td>
                        <td>{faNum(r.gramsSold, 4)}</td>
                        <td className="font-bold">{toman(r.totalRial)}</td>
                        <td className="text-amber-700">{toman(r.commissionRial)}</td>
                        <td style={{ color: "var(--color-emerald)" }} className="font-bold">
                          {toman(r.netPayableRial)}
                        </td>
                        <td className="text-green-700">{toman(r.settledRial)}</td>
                        <td className="text-[11px]">
                          {faNum(r.allocatedCount)} / {faNum(r.returnedCount)}
                        </td>
                        <td className="text-[11px]">
                          {faNum(r.stockCount)} شمش
                          <p className="text-gray-400">{faNum(r.stockGrams, 4)} گرم</p>
                        </td>
                        <td className={`font-black ${Number(r.balanceRial) > 0 ? "text-red-600" : "text-green-700"}`}>
                          {toman(r.balanceRial)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[11px] text-gray-400 mt-3">مبالغ به تومان است.</p>
          </div>
        </>
      )}
    </div>
  );
}
