// admin/app/(dashboard)/accounting/trial-balance/page.tsx — تراز آزمایشی چهارستونی
"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import {
  CsvButton,
  DateRange,
  Num,
  PageHeader,
  Spinner,
  Table,
  cardStyle,
  downloadCsv,
  fetcher,
  grams,
  toman,
} from "@/app/components/finance/ui";

interface Row {
  accountId: string;
  code: string;
  name: string;
  openingDebitRial: string;
  openingCreditRial: string;
  periodDebitRial: string;
  periodCreditRial: string;
  closingDebitRial: string;
  closingCreditRial: string;
  closingGrams: string;
}
interface TB {
  rows: Row[];
  totals: Record<string, string>;
  isBalanced: boolean;
}

const t = (v: string) => (Number(v) ? toman(v) : "—");

export default function TrialBalancePage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [hideZero, setHideZero] = useState(true);
  const qs = new URLSearchParams({ hideZero: String(hideZero) });
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data, isLoading } = useSWR<TB>(`/api/admin/accounting/trial-balance?${qs}`, fetcher);

  const exportCsv = () =>
    data &&
    downloadCsv(
      `trial-balance-${from || "start"}-${to || "now"}.csv`,
      ["کد", "حساب", "بدهکار ابتدای دوره", "بستانکار ابتدای دوره", "گردش بدهکار", "گردش بستانکار", "مانده بدهکار", "مانده بستانکار", "مانده گرم"],
      data.rows.map((r) => [
        r.code,
        r.name,
        r.openingDebitRial,
        r.openingCreditRial,
        r.periodDebitRial,
        r.periodCreditRial,
        r.closingDebitRial,
        r.closingCreditRial,
        r.closingGrams,
      ]),
    );

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Scale}
        title="تراز آزمایشی"
        subtitle="تراز چهارستونی: مانده ابتدای دوره، گردش بدهکار و بستانکار دوره و مانده پایان دوره (ریال به تومان). جمع بدهکار و بستانکار باید همیشه برابر باشد."
        actions={<CsvButton onClick={exportCsv} />}
      />
      <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo}>
          <label className="flex items-center gap-2 text-[12px] font-bold text-gray-600 pb-2">
            <input type="checkbox" checked={hideZero} onChange={(e) => setHideZero(e.target.checked)} /> پنهان کردن حساب‌های بدون گردش
          </label>
        </DateRange>
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <>
            <div
              className="flex items-center gap-2 p-3 rounded-xl text-[12px] font-bold"
              style={{ backgroundColor: data.isBalanced ? "#dcfce7" : "#fee2e2", color: data.isBalanced ? "#16a34a" : "#dc2626" }}
            >
              {data.isBalanced ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {data.isBalanced ? "تراز صحیح است — بدهکار و بستانکار برابرند" : "هشدار: تراز نامتوازن است! صفحه‌ی مغایرت‌گیری را بررسی کنید"}
            </div>
            <Table>
              <thead>
                <tr>
                  <th rowSpan={2}>کد</th>
                  <th rowSpan={2}>حساب</th>
                  <th colSpan={2}>ابتدای دوره</th>
                  <th colSpan={2}>گردش دوره</th>
                  <th colSpan={2}>مانده پایان دوره</th>
                  <th rowSpan={2}>مانده گرم</th>
                </tr>
                <tr>
                  <th>بدهکار</th>
                  <th>بستانکار</th>
                  <th>بدهکار</th>
                  <th>بستانکار</th>
                  <th>بدهکار</th>
                  <th>بستانکار</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.code}>
                    <Num bold>{r.code}</Num>
                    <td>
                      <Link href={`/accounting/chart-of-accounts/${r.accountId}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <Num>{t(r.openingDebitRial)}</Num>
                    <Num>{t(r.openingCreditRial)}</Num>
                    <Num>{t(r.periodDebitRial)}</Num>
                    <Num>{t(r.periodCreditRial)}</Num>
                    <Num bold>{t(r.closingDebitRial)}</Num>
                    <Num bold>{t(r.closingCreditRial)}</Num>
                    <Num>{Number(r.closingGrams) ? grams(r.closingGrams) : "—"}</Num>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-black">
                  <td colSpan={2}>جمع کل</td>
                  <Num>{t(data.totals.openingDebitRial)}</Num>
                  <Num>{t(data.totals.openingCreditRial)}</Num>
                  <Num>{t(data.totals.periodDebitRial)}</Num>
                  <Num>{t(data.totals.periodCreditRial)}</Num>
                  <Num>{t(data.totals.closingDebitRial)}</Num>
                  <Num>{t(data.totals.closingCreditRial)}</Num>
                  <td></td>
                </tr>
              </tfoot>
            </Table>
          </>
        )}
      </div>
    </div>
  );
}
