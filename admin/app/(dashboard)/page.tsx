"use client";
import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

type WithdrawalStatus = "PENDING" | "APPROVED" | "REJECTED";

interface Withdrawal {
  id: string;
  amountToman: number | string;
  status: WithdrawalStatus;
  user: { phone: string };
  bankAccount: { bankName: string };
}

interface WithdrawalsResponse {
  data: Withdrawal[];
}

export default function WithdrawalsPage() {
  const { data, mutate, isLoading } = useSWR<WithdrawalsResponse>(
    "/api/admin/withdrawals",
    fetcher,
  );
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await axios.post(`/api/admin/withdrawals/${id}/approve`);
      mutate();
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt("دلیل رد درخواست:");
    if (!reason) return;
    setProcessingId(id);
    try {
      await axios.post(`/api/admin/withdrawals/${id}/reject`, { reason });
      mutate();
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div>
      <h1 className="text-lg font-black text-gray-900 mb-5">
        درخواست‌های برداشت
      </h1>
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
              <th>مبلغ</th>
              <th>حساب مقصد</th>
              <th>وضعیت</th>
              <th>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="text-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" />
                </td>
              </tr>
            ) : (
              data?.data?.map((w) => (
                <tr key={w.id}>
                  <td dir="ltr" className="text-left">
                    {w.user.phone}
                  </td>
                  <td className="font-black">
                    {Number(w.amountToman).toLocaleString("fa-IR")} ت
                  </td>
                  <td>{w.bankAccount.bankName}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background:
                          w.status === "PENDING"
                            ? "#fef3c7"
                            : w.status === "APPROVED"
                              ? "#dcfce7"
                              : "#fee2e2",
                        color:
                          w.status === "PENDING"
                            ? "#b45309"
                            : w.status === "APPROVED"
                              ? "#16a34a"
                              : "#dc2626",
                      }}
                    >
                      {w.status}
                    </span>
                  </td>
                  <td>
                    {w.status === "PENDING" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(w.id)}
                          disabled={processingId === w.id}
                          className="p-1.5 rounded-lg text-green-600 hover:bg-green-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleReject(w.id)}
                          disabled={processingId === w.id}
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
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
