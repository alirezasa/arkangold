// admin/app/(dashboard)/finance-report/page.tsx
//
// گزارش دوره‌ای واریز و برداشت ریالی کاربران: وضعیت‌ها، روش‌ها، جمع روزانه، کارمزد و صف باز.
"use client";
import { useState } from "react";
import useSWR from "swr";
import { BarChart3 } from "lucide-react";
import {
  CsvButton,
  DateRange,
  Kpi,
  PageHeader,
  Spinner,
  Table,
  cardStyle,
  downloadCsv,
  fetcher,
  monthStartIso,
  toman,
  todayIso,
} from "@/app/components/finance/ui";
import { formatJalali, todayIsoLocal } from "@/app/utils/jalali";

interface DepositReport {
  byStatus: { status: string; label: string; count: number; amountRial: string }[];
  byMethod: { method: string; count: number; amountRial: string }[];
  daily: { day: string; count: number; amountRial: string }[];
  averageReviewHours: number | null;
  openQueue: { count: number; amountRial: string };
}
interface WithdrawalReport {
  byStatus: { status: string; label: string; count: number; amountRial: string; feeRial: string }[];
  bySourceAccount: { sourceAccountCode: string | null; payoutMethod: string | null; count: number; amountRial: string; feeRial: string; netAmountRial: string }[];
  daily: { day: string; count: number; amountRial: string; feeRial: string }[];
  openQueue: { count: number; amountRial: string };
}

const METHOD_FA: Record<string, string> = { ONLINE: "درگاه آنلاین", CARD_TO_CARD: "کارت به کارت", BANK_TRANSFER: "حواله بانکی" };
const PAYOUT_FA: Record<string, string> = { PAYA: "پایا", SATNA: "ساتنا", POL: "پل", CARD_TO_CARD: "کارت به کارت", INTERNAL: "انتقال داخلی" };

export default function FinanceReportPage() {
  const [from, setFrom] = useState(monthStartIso());
  const [to, setTo] = useState(todayIso());
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const { data: dep } = useSWR<DepositReport>(`/api/admin/deposits/report?${qs.toString()}`, fetcher);
  const { data: wd } = useSWR<WithdrawalReport>(`/api/admin/withdrawals/report?${qs.toString()}`, fetcher);

  const depApproved = dep?.byStatus.find((s) => s.status === "APPROVED");
  const wdPaid = wd?.byStatus.find((s) => s.status === "PROCESSED");
  const wdFee = (wd?.byStatus ?? []).filter((s) => s.status === "PROCESSED").reduce((a, s) => a + Number(s.feeRial), 0);

  // جدول روزانه‌ی ترکیبی
  const days = new Map<string, { dep: number; depCount: number; wd: number; wdCount: number; fee: number }>();
  for (const d of dep?.daily ?? []) {
    const x = days.get(d.day) ?? { dep: 0, depCount: 0, wd: 0, wdCount: 0, fee: 0 };
    x.dep += Number(d.amountRial);
    x.depCount += d.count;
    days.set(d.day, x);
  }
  for (const d of wd?.daily ?? []) {
    const x = days.get(d.day) ?? { dep: 0, depCount: 0, wd: 0, wdCount: 0, fee: 0 };
    x.wd += Number(d.amountRial);
    x.wdCount += d.count;
    x.fee += Number(d.feeRial);
    days.set(d.day, x);
  }
  const daily = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));

  const exportCsv = () =>
    downloadCsv(
      `deposit-withdrawal-${todayIsoLocal()}.csv`,
      ["تاریخ", "تعداد واریز", "مبلغ واریز (ریال)", "تعداد برداشت", "مبلغ برداشت (ریال)", "کارمزد برداشت (ریال)", "خالص ورود/خروج (ریال)"],
      daily.map(([day, v]) => [formatJalali(day, false), v.depCount, v.dep, v.wdCount, v.wd, v.fee, v.dep - v.wd]),
    );

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={BarChart3}
        title="گزارش واریز و برداشت"
        subtitle="جریان نقدی ریالی کیف پول کاربران در بازه‌ی انتخابی؛ واریزها بر اساس تاریخ تأیید و برداشت‌ها بر اساس تاریخ پرداخت بانکی."
        actions={<CsvButton onClick={exportCsv} />}
      />
      <div className="rounded-2xl p-4" style={cardStyle}>
        <DateRange from={from} to={to} onFrom={setFrom} onTo={setTo} />
      </div>

      {!dep || !wd ? (
        <Spinner />
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Kpi title="واریز تأییدشده" value={`${toman(depApproved?.amountRial ?? 0)} ت`} hint={`${(depApproved?.count ?? 0).toLocaleString("fa-IR")} مورد`} />
            <Kpi title="برداشت پرداخت‌شده" value={`${toman(wdPaid?.amountRial ?? 0)} ت`} hint={`${(wdPaid?.count ?? 0).toLocaleString("fa-IR")} مورد`} />
            <Kpi title="درآمد کارمزد برداشت" value={`${toman(wdFee)} ت`} />
            <Kpi
              title="صف باز"
              value={`${(dep.openQueue.count + wd.openQueue.count).toLocaleString("fa-IR")} مورد`}
              hint={`واریز: ${toman(dep.openQueue.amountRial)} ت — برداشت: ${toman(wd.openQueue.amountRial)} ت`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
              <h2 className="font-black text-[14px]">واریزها</h2>
              <Table>
                <thead>
                  <tr>
                    <th>وضعیت</th>
                    <th>تعداد</th>
                    <th>مبلغ (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  {dep.byStatus.map((s) => (
                    <tr key={s.status}>
                      <td>{s.label}</td>
                      <td>{s.count.toLocaleString("fa-IR")}</td>
                      <td>{toman(s.amountRial)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Table>
                <thead>
                  <tr>
                    <th>روش (تأییدشده)</th>
                    <th>تعداد</th>
                    <th>مبلغ (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  {dep.byMethod.map((m) => (
                    <tr key={m.method}>
                      <td>{METHOD_FA[m.method] ?? m.method}</td>
                      <td>{m.count.toLocaleString("fa-IR")}</td>
                      <td>{toman(m.amountRial)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              {dep.averageReviewHours != null && (
                <p className="text-[12px] text-gray-500">میانگین زمان تأیید: {dep.averageReviewHours.toLocaleString("fa-IR")} ساعت</p>
              )}
            </div>
            <div className="rounded-2xl p-4 space-y-3" style={cardStyle}>
              <h2 className="font-black text-[14px]">برداشت‌ها</h2>
              <Table>
                <thead>
                  <tr>
                    <th>وضعیت</th>
                    <th>تعداد</th>
                    <th>مبلغ (تومان)</th>
                    <th>کارمزد</th>
                  </tr>
                </thead>
                <tbody>
                  {wd.byStatus.map((s) => (
                    <tr key={s.status}>
                      <td>{s.label}</td>
                      <td>{s.count.toLocaleString("fa-IR")}</td>
                      <td>{toman(s.amountRial)}</td>
                      <td>{toman(s.feeRial)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <Table>
                <thead>
                  <tr>
                    <th>حساب مبدأ</th>
                    <th>روش</th>
                    <th>تعداد</th>
                    <th>خالص پرداختی (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  {wd.bySourceAccount.map((s, i) => (
                    <tr key={i}>
                      <td dir="ltr">{s.sourceAccountCode ?? "—"}</td>
                      <td>{PAYOUT_FA[s.payoutMethod ?? ""] ?? s.payoutMethod ?? "—"}</td>
                      <td>{s.count.toLocaleString("fa-IR")}</td>
                      <td>{toman(s.netAmountRial)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </div>

          <div className="rounded-2xl p-4" style={cardStyle}>
            <h2 className="font-black text-[14px] mb-3">گردش روزانه</h2>
            <Table>
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>واریز (تومان)</th>
                  <th>برداشت (تومان)</th>
                  <th>کارمزد</th>
                  <th>خالص</th>
                </tr>
              </thead>
              <tbody>
                {daily.map(([day, v]) => (
                  <tr key={day}>
                    <td>{formatJalali(day)}</td>
                    <td>
                      {toman(v.dep)} <span className="text-gray-400">({v.depCount.toLocaleString("fa-IR")})</span>
                    </td>
                    <td>
                      {toman(v.wd)} <span className="text-gray-400">({v.wdCount.toLocaleString("fa-IR")})</span>
                    </td>
                    <td>{toman(v.fee)}</td>
                    <td className={v.dep - v.wd < 0 ? "text-red-600 font-bold" : "font-bold"}>{toman(v.dep - v.wd)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
