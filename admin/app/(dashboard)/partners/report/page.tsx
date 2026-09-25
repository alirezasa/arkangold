// admin/app/(dashboard)/partners/report/page.tsx — گزارش عملکرد شرکا و سنی مطالبات
"use client";
import { useState } from "react";
import useSWR from "swr";
import { BarChart3 } from "lucide-react";
import {
  CsvButton,
  DateRange,
  Num,
  PARTNER_KIND_FA,
  PageHeader,
  Spinner,
  Table,
  cardStyle,
  downloadCsv,
  fetcher,
  grams,
  monthStartIso,
  signedToman,
  toman,
  todayIso,
} from "@/app/components/finance/ui";

interface Report {
  data: {
    partnerId: string;
    code: string;
    name: string;
    kind: string;
    meltedGold: { count: number; grams: string; totalRial: string };
    bullion: { count: number; grams: string; totalRial: string };
    totalSalesRial: string;
    commissionRial: string;
    refunds: { count: number; totalRial: string };
    settlements: { count: number; amountRial: string };
    balanceRial: string;
    aging: { current: string; d7: string; d30: string; over30: string };
  }[];
}

export default function PartnerReportPage() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data } = useSWR<Report>(`/api/admin/partners/report?${qs}`, fetcher);
  const exportCsv = () =>
    data &&
    downloadCsv(
      `partners-report-${from}-${to}.csv`,
      ["کد", "شریک", "آب‌شده (گرم)", "شمش (گرم)", "فروش کل (ریال)", "کارمزد شریک (ریال)", "استرداد (ریال)", "تسویه (ریال)", "مانده طلب (ریال)", "جاری", "۱-۷ روز", "۸-۳۰ روز", "+۳۰ روز"],
      data.data.map((r) => [
        r.code,
        r.name,
        r.meltedGold.grams,
        r.bullion.grams,
        r.totalSalesRial,
        r.commissionRial,
        r.refunds.totalRial,
        r.settlements.amountRial,
        r.balanceRial,
        r.aging.current,
        r.aging.d7,
        r.aging.d30,
        r.aging.over30,
      ]),
    );
  return (
    <div className="space-y-5">
      <PageHeader
        icon={BarChart3}
        title="گزارش عملکرد و مطالبات شرکا"
        subtitle="فروش طلای آب‌شده و شمش هر شریک در بازه، کارمزد پرداختی، استردادها، تسویه‌ها و سنی مطالبات (Aging) از سررسید"
        actions={<CsvButton onClick={exportCsv} />}
      />
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
        {!data ? (
          <Spinner />
        ) : (
          <Table>
            <thead>
              <tr>
                <th rowSpan={2}>شریک</th>
                <th colSpan={2}>فروش در بازه</th>
                <th rowSpan={2}>مبلغ کل (تومان)</th>
                <th rowSpan={2}>کارمزد شریک</th>
                <th rowSpan={2}>استرداد</th>
                <th rowSpan={2}>تسویه‌ی دریافتی</th>
                <th rowSpan={2}>مانده طلب</th>
                <th colSpan={4}>سنی مطالبات (تومان)</th>
              </tr>
              <tr>
                <th>آب‌شده (گرم)</th>
                <th>شمش (گرم)</th>
                <th>جاری</th>
                <th>۱-۷ روز</th>
                <th>۸-۳۰ روز</th>
                <th>+۳۰ روز</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((r) => (
                <tr key={r.partnerId}>
                  <td>
                    <p className="font-bold">{r.name}</p>
                    <p className="text-[10px] text-gray-400">
                      {r.code} — {PARTNER_KIND_FA[r.kind]}
                    </p>
                  </td>
                  <Num>{grams(r.meltedGold.grams)}</Num>
                  <Num>{grams(r.bullion.grams)}</Num>
                  <Num bold>{toman(r.totalSalesRial)}</Num>
                  <Num>{toman(r.commissionRial)}</Num>
                  <Num>{Number(r.refunds.totalRial) ? toman(r.refunds.totalRial) : "—"}</Num>
                  <Num>{toman(r.settlements.amountRial)}</Num>
                  <Num bold>{signedToman(r.balanceRial)}</Num>
                  <Num>{toman(r.aging.current)}</Num>
                  <Num>{toman(r.aging.d7)}</Num>
                  <Num>{toman(r.aging.d30)}</Num>
                  <Num>
                    <span className={Number(r.aging.over30) ? "text-red-600 font-bold" : ""}>{toman(r.aging.over30)}</span>
                  </Num>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
