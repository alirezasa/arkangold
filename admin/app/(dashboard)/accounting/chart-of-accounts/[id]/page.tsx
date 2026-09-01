"use client";
import { useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { adminApi } from "@/app/core/api";
import { Loader2, ArrowRight } from "lucide-react";
import Link from "next/link";

const fetcher = (url: string) => adminApi.get(url).then((r) => r.data);

interface LedgerRow {
  id: string;
  side: "DEBIT" | "CREDIT";
  amountToman: string;
  amountGrams: string;
  description: string | null;
  createdAt: string;
}
interface LedgerResponse {
  account: { code: string; name: string; balanceToman: string };
  data: LedgerRow[];
  total: number;
  totalPages: number;
}

export default function AccountLedgerPage() {
  const { id } = useParams<{ id: string }>();
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSWR<LedgerResponse>(
    id ? `/api/admin/accounting/accounts/${id}/ledger?page=${page}&limit=30` : null,
    fetcher,
  );

  return (
    <div>
      <Link
        href="/accounting/chart-of-accounts"
        className="inline-flex items-center gap-1.5 text-[12px] font-bold text-gray-400 mb-4 hover:text-gray-600"
      >
        <ArrowRight className="w-3.5 h-3.5" />
        بازگشت به دفتر حساب‌ها
      </Link>

      {data && (
        <>
          <h1 className="text-lg font-black text-gray-900 mb-1">
            {data.account.name} <span dir="ltr" className="text-gray-400">({data.account.code})</span>
          </h1>
          <p className="text-[13px] font-bold mb-4" style={{ color: "var(--color-emerald)" }}>
            مانده فعلی: {Number(data.account.balanceToman).toLocaleString("fa-IR")} تومان
          </p>
        </>
      )}

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
              <th>شرح سند</th>
              <th>طرف</th>
              <th>مبلغ (تومان)</th>
              <th>تاریخ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={4} className="text-center py-10 text-[12px] text-gray-400">
                  رکوردی یافت نشد
                </td>
              </tr>
            ) : (
              data.data.map((row) => (
                <tr key={row.id}>
                  <td className="text-[12px]">{row.description ?? "—"}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: row.side === "DEBIT" ? "#dbeafe" : "#fce7f3",
                        color: row.side === "DEBIT" ? "#2563eb" : "#be185d",
                      }}
                    >
                      {row.side === "DEBIT" ? "بدهکار" : "بستانکار"}
                    </span>
                  </td>
                  <td dir="ltr" className="text-left font-bold">
                    {Number(row.amountToman).toLocaleString("fa-IR")}
                  </td>
                  <td className="text-[12px] text-gray-500">
                    {new Date(row.createdAt).toLocaleString("fa-IR")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            قبلی
          </button>
          <span className="text-[12px] font-bold text-gray-500">
            صفحه {page.toLocaleString("fa-IR")} از {data.totalPages.toLocaleString("fa-IR")}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] font-bold disabled:opacity-40"
          >
            بعدی
          </button>
        </div>
      )}
    </div>
  );
}