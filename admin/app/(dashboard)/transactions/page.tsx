"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Loader2, Receipt } from "lucide-react";

// تعریف اینترفیس برای تایپ‌سیف کردن داده‌های دریافتی از API
interface Transaction {
  id: string;
  userPhone: string;
  type: string;
  amountGrams?: string | number;
  amountToman?: string | number;
  status: "COMPLETED" | "PENDING" | "FAILED" | string;
  createdAt: string;
}

interface TransactionsResponse {
  data: Transaction[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

const fetcher = (url: string) =>
  axios.get<TransactionsResponse>(url).then((r) => r.data);

const TYPE_LABELS: Record<string, string> = {
  BUY_GOLD: "خرید طلا",
  SELL_GOLD: "فروش طلا",
  DEPOSIT: "واریز",
  WITHDRAWAL: "برداشت",
  FEE: "کارمزد",
  TAX: "مالیات",
  SHOP_PURCHASE: "خرید فروشگاه",
  PHYSICAL_DELIVERY: "تحویل فیزیکی",
  REFUND: "بازگشت وجه",
  REFERRAL_REWARD: "پاداش معرفی",
};

export default function AdminTransactionsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<TransactionsResponse>(
    `/api/admin/transactions?page=${page}&limit=30`,
    fetcher,
  );

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-1">
        تراکنش‌های کاربران
      </h1>
      <p className="text-[12px] text-gray-400 mb-5">
        {data ? `${data.total.toLocaleString("fa-IR")} تراکنش` : "..."}
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
              <th>کاربر</th>
              <th>نوع</th>
              <th>مبلغ/مقدار</th>
              <th>وضعیت</th>
              <th>تاریخ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : !data?.data?.length ? (
              <tr>
                <td colSpan={5} className="text-center py-10">
                  <div className="flex flex-col items-center gap-2">
                    <Receipt className="w-8 h-8 text-gray-200" />
                    <p className="text-[12px] text-gray-400">
                      تراکنشی یافت نشد
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              // رفع خطا: استفاده از تایپ Transaction به جای any
              data.data.map((t: Transaction) => (
                <tr key={t.id}>
                  <td dir="ltr" className="text-left">
                    {t.userPhone}
                  </td>
                  <td>{TYPE_LABELS[t.type] ?? t.type}</td>
                  <td>
                    {t.amountGrams
                      ? `${Number(t.amountGrams).toFixed(3)} گ`
                      : t.amountToman
                        ? `${Number(t.amountToman).toLocaleString("fa-IR")} ت`
                        : "—"}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          t.status === "COMPLETED"
                            ? "#dcfce7"
                            : t.status === "PENDING"
                              ? "#fef3c7"
                              : "#fee2e2",
                        color:
                          t.status === "COMPLETED"
                            ? "#16a34a"
                            : t.status === "PENDING"
                              ? "#b45309"
                              : "#dc2626",
                      }}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="text-[12px] text-gray-500">
                    {new Date(t.createdAt).toLocaleDateString("fa-IR")}
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
            صفحه {page.toLocaleString("fa-IR")} از{" "}
            {data.totalPages.toLocaleString("fa-IR")}
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
