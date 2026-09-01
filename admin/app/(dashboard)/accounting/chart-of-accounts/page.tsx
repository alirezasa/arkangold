"use client";
import Link from "next/link";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import { Loader2, BookOpen } from "lucide-react";

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

interface AccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  balanceToman: string;
  balanceGrams: string;
}

const TYPE_LABELS: Record<string, string> = {
  ASSET: "دارایی",
  LIABILITY: "بدهی",
  EQUITY: "سرمایه",
  INCOME: "درآمد",
  EXPENSE: "هزینه",
};

export default function ChartOfAccountsPage() {
  const { data, isLoading } = useSWR<AccountRow[]>(
    "/api/admin/accounting/accounts",
    fetcher,
  );

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">دفتر حساب‌ها</h1>
      <p className="text-[12px] text-gray-400 mb-4">
        {data ? `${data.length.toLocaleString("fa-IR")} حساب` : "..."}
      </p>

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
              <th>کد</th>
              <th>نام حساب</th>
              <th>نوع</th>
              <th>مانده ریالی (تومان)</th>
              <th>مانده طلا (گرم)</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.length ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <BookOpen className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">حسابی یافت نشد</p>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((a) => (
                <tr key={a.id}>
                  <td dir="ltr" className="text-left font-bold">
                    {a.code}
                  </td>
                  <td>
                    <Link
                      href={`/accounting/chart-of-accounts/${a.id}`}
                      className="font-bold hover:underline"
                      style={{ color: "var(--color-emerald)" }}
                    >
                      {a.name}
                    </Link>
                  </td>
                  <td className="text-[12px] text-gray-500">
                    {TYPE_LABELS[a.type] ?? a.type}
                  </td>
                  <td dir="ltr" className="text-left">
                    {Number(a.balanceToman).toLocaleString("fa-IR")}
                  </td>
                  <td dir="ltr" className="text-left">
                    {Number(a.balanceGrams).toFixed(4)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}