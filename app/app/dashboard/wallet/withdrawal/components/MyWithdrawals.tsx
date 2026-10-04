// app/app/dashboard/wallet/withdrawal/components/MyWithdrawals.tsx
//
// درخواست‌های برداشت کاربر با وضعیت، مبلغ خالص واریزی، شماره پیگیری بانک و امکان لغو.
"use client";

import { useState } from "react";
import useSWR from "swr";
import axios from "axios";
import { Loader2 } from "lucide-react";

interface Item {
  id: string;
  requestNumber: string | null;
  status: "PENDING" | "APPROVED" | "PROCESSED" | "REJECTED" | "CANCELLED" | "RETURNED";
  amountRial: string;
  feeRial: string;
  netAmountRial: string;
  bankName: string;
  cardNumber: string;
  bankReference: string | null;
  rejectionReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

const STATUS: Record<Item["status"], { label: string; bg: string; color: string }> = {
  PENDING: { label: "در انتظار بررسی", bg: "#fef3c7", color: "#b45309" },
  APPROVED: { label: "تأییدشده — در صف واریز", bg: "#dbeafe", color: "#2563eb" },
  PROCESSED: { label: "واریز شد", bg: "#dcfce7", color: "#16a34a" },
  REJECTED: { label: "رد شد", bg: "#fee2e2", color: "#dc2626" },
  CANCELLED: { label: "لغو شد", bg: "#f3f4f6", color: "#6b7280" },
  RETURNED: { label: "برگشت از بانک", bg: "#f3e8ff", color: "#7e22ce" },
};

const toman = (rial: string) => Math.round(Number(rial) / 10).toLocaleString("fa-IR");
const fetcher = (url: string) => axios.get(url).then((r) => r.data);

export default function MyWithdrawals({ refreshKey }: { refreshKey?: number }) {
  const { data, mutate, isLoading } = useSWR<{ items: Item[] }>(`/api/wallet/withdrawals?limit=10&r=${refreshKey ?? 0}`, fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancel = async (id: string) => {
    if (!window.confirm("درخواست برداشت لغو شود؟")) return;
    setBusy(id);
    setError(null);
    try {
      await axios.post(`/api/wallet/withdrawals/${id}/cancel`);
      await mutate();
    } catch (e) {
      const m = axios.isAxiosError(e) ? (e.response?.data as { message?: string } | undefined)?.message : null;
      setError(m ?? "لغو درخواست ناموفق بود");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return null;
  const items = data?.items ?? [];
  if (!items.length) return null;

  return (
    <div className="rounded-2xl p-4 mt-4 space-y-3" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <h2 className="text-[13px] font-black text-gray-800">درخواست‌های برداشت من</h2>
      {error && <p className="text-[12px] text-red-600 font-bold">{error}</p>}
      {items.map((w) => {
        const st = STATUS[w.status];
        return (
          <div key={w.id} className="rounded-xl border border-gray-100 p-3 space-y-1.5 text-[12px]">
            <div className="flex items-center justify-between">
              <span className="font-black text-gray-800">{toman(w.amountRial)} تومان</span>
              <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold" style={{ background: st.bg, color: st.color }}>
                {st.label}
              </span>
            </div>
            <div className="flex justify-between text-gray-500">
              <span>
                {w.bankName} <span dir="ltr">{w.cardNumber}</span>
              </span>
              <span>{new Date(w.createdAt).toLocaleDateString("fa-IR")}</span>
            </div>
            {Number(w.feeRial) > 0 && (
              <p className="text-gray-500">
                کارمزد {toman(w.feeRial)} — مبلغ واریزی {toman(w.netAmountRial)} تومان
              </p>
            )}
            {w.status === "PROCESSED" && w.bankReference && (
              <p className="text-gray-600">
                شماره پیگیری بانک: <span dir="ltr" className="font-bold">{w.bankReference}</span>
              </p>
            )}
            {w.status === "REJECTED" && w.rejectionReason && <p className="text-red-600">دلیل: {w.rejectionReason}</p>}
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-gray-400" dir="ltr">
                {w.requestNumber}
              </span>
              {w.status === "PENDING" && (
                <button type="button" onClick={() => void cancel(w.id)} disabled={busy === w.id} className="text-[11px] font-bold text-red-600">
                  {busy === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "لغو درخواست"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
