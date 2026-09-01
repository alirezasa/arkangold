"use client";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import { Loader2, Scale, CheckCircle2, AlertTriangle } from "lucide-react";

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

interface TrialBalanceRow {
  code: string;
  name: string;
  debitToman: string;
  creditToman: string;
}
interface TrialBalanceResponse {
  rows: TrialBalanceRow[];
  totalDebitToman: string;
  totalCreditToman: string;
  isBalanced: boolean;
}

export default function TrialBalancePage() {
  const { data, isLoading } = useSWR<TrialBalanceResponse>(
    "/api/admin/accounting/trial-balance",
    fetcher,
  );

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">تراز آزمایشی</h1>
      <p className="text-[12px] text-gray-400 mb-4">
        جمع ستون بدهکار باید همیشه با جمع ستون بستانکار برابر باشد
      </p>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <Scale className="w-8 h-8 text-gray-200" />
          <p className="text-[12px] text-gray-400">داده‌ای یافت نشد</p>
        </div>
      ) : (
        <>
          <div
            className="flex items-center gap-2 mb-4 p-4 rounded-2xl text-[13px] font-bold"
            style={{
              backgroundColor: data.isBalanced ? "#dcfce7" : "#fee2e2",
              color: data.isBalanced ? "#16a34a" : "#dc2626",
            }}
          >
            {data.isBalanced ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
            {data.isBalanced
              ? "تراز صحیح است — بدهکار و بستانکار برابرند"
              : "هشدار: تراز نامتوازن است! نیاز به بررسی فوری"}
          </div>

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <table className="w-full admin-table">
              <thead>
                <tr>
                  <th>کد حساب</th>
                  <th>نام حساب</th>
                  <th>بدهکار (تومان)</th>
                  <th>بستانکار (تومان)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.code}>
                    <td dir="ltr" className="text-left font-bold">
                      {r.code}
                    </td>
                    <td>{r.name}</td>
                    <td dir="ltr" className="text-left">
                      {Number(r.debitToman) > 0
                        ? Number(r.debitToman).toLocaleString("fa-IR")
                        : "—"}
                    </td>
                    <td dir="ltr" className="text-left">
                      {Number(r.creditToman) > 0
                        ? Number(r.creditToman).toLocaleString("fa-IR")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-black">
                  <td colSpan={2}>جمع کل</td>
                  <td dir="ltr" className="text-left">
                    {Number(data.totalDebitToman).toLocaleString("fa-IR")}
                  </td>
                  <td dir="ltr" className="text-left">
                    {Number(data.totalCreditToman).toLocaleString("fa-IR")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}