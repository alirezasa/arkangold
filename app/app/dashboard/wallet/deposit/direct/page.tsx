"use client";

import { useState } from "react";
import Link from "next/link";
import { useDepositConfig } from "@/app/hooks/useWallet";
import { useBankAccounts } from "@/app/hooks/useBankAccounts";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { ChevronLeft, Copy, CheckCircle2, CreditCard, AlertCircle } from "lucide-react";

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 2000); }}
      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
      {ok ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
    </button>
  );
}

function toToman(rial: number) {
  return (rial / 10).toLocaleString("fa-IR");
}

export default function DirectDepositPage() {
  const { config } = useDepositConfig();
  const { accounts } = useBankAccounts();
  const { data: goldPrice } = useGoldPrice();
  const [selectedCardId, setSelectedCardId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const cfg = config?.direct;
  const verifiedCards = accounts.filter((a) => a.isVerified);

  const handleConfirm = () => {
    if (!selectedCardId) return setError("یک کارت انتخاب کنید");
    setConfirmed(true);
  };

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/dashboard/wallet/deposit"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">واریز مستقیم</h1>
          <p className="text-[11px] text-gray-400">
            روزانه تا {toToman(cfg?.dailyLimit ?? 150000000)} تومان
          </p>
        </div>
        {goldPrice && (
          <div className="mr-auto px-3 py-1.5 rounded-xl text-[11px] font-bold"
            style={{ background: "rgba(197,160,89,.1)", color: "#92400e" }}>
            🪙 {(goldPrice.price * 1000).toLocaleString("fa-IR")} ت
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
        </div>
      )}

      {!confirmed ? (
        <div className="space-y-4">
          {/* انتخاب کارت */}
          <div className="rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            <h2 className="text-[14px] font-black text-gray-800">مبداهای مجاز واریز</h2>
            {verifiedCards.length === 0 ? (
              <div className="text-center py-6">
                <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-[13px] text-gray-400">کارت تایید شده‌ای ندارید</p>
                <Link href="/dashboard/cards"
                  className="inline-block mt-3 px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                  style={{ backgroundColor: "var(--color-emerald)" }}>افزودن کارت</Link>
              </div>
            ) : (
              <div className="space-y-2">
                {verifiedCards.map((card) => (
                  <button key={card.id}
                    onClick={() => { setSelectedCardId(card.id); setError(null); }}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-right ${
                      selectedCardId === card.id ? "border-emerald-500 bg-emerald-50" : "border-gray-100 bg-gray-50"}`}>
                    <CreditCard className={`w-4 h-4 shrink-0 ${selectedCardId === card.id ? "text-emerald-600" : "text-gray-400"}`} />
                    <div className="flex-1">
                      <p className="text-[13px] font-black text-gray-800">{card.bankName}</p>
                      <p className="text-[12px] text-gray-400" dir="ltr">{card.cardNumber}</p>
                    </div>
                    {selectedCardId === card.id && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* اطلاعات کارت مقصد */}
          {cfg && (
            <div className="rounded-2xl p-5 space-y-3"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <h2 className="text-[14px] font-black text-gray-800">مشخصات حساب مقصد</h2>
              <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-gray-50">
                <span className="text-[12px] text-gray-500">شماره کارت مقصد</span>
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-black text-gray-800 tracking-widest" dir="ltr">
                    {cfg.destinationCardFull}
                  </span>
                  <CopyBtn text={cfg.destinationCardFull} />
                </div>
              </div>
            </div>
          )}

          <button onClick={handleConfirm}
            disabled={!selectedCardId}
            className="w-full py-4 rounded-xl font-black text-white text-[14px] disabled:opacity-40"
            style={{ backgroundColor: "var(--color-emerald)" }}>
            متوجه شدم
          </button>
        </div>
      ) : (
        <div className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-[18px] font-black text-gray-900 mb-2">منتظر واریز شما هستیم</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
            پس از واریز از کارت ثبت‌شده، مبلغ به صورت خودکار به کیف پول شما افزوده می‌شود.
          </p>
          <Link href="/dashboard/wallet"
            className="block py-3.5 rounded-xl font-black text-white text-[14px]"
            style={{ backgroundColor: "var(--color-emerald)" }}>
            بازگشت به کیف پول
          </Link>
        </div>
      )}
    </div>
  );
}