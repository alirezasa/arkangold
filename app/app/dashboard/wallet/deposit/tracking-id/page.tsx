"use client";
import { useState } from "react";
import Link from "next/link";
import { useDepositConfig, useTrackingIdDeposit } from "@/app/hooks/useWallet";
import { useBankAccounts } from "@/app/hooks/useBankAccounts";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import {
  ChevronLeft,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
} from "lucide-react";

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}

export default function TrackingIdPage() {
  const { config } = useDepositConfig();
  const { accounts } = useBankAccounts();
  const { data: goldPrice } = useGoldPrice();
  const { loading, error, setError, getTrackingInfo } = useTrackingIdDeposit();

  const [selectedCardId, setSelectedCardId] = useState("");
  const [info, setInfo] = useState<{
    trackingId: string;
    destinationAccount: string;
    destinationSheba: string;
    destinationOwner: string;
    sourceCard: string;
    instruction: string;
  } | null>(null);

  const verifiedCards = accounts.filter((a) => a.isVerified);
  const cfg = config?.trackingId;

  const handleGetInfo = async () => {
    if (!selectedCardId) return setError("یک کارت انتخاب کنید");
    const result = await getTrackingInfo(selectedCardId);
    if (result) setInfo(result);
  };

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet/deposit"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">
            واریز شناسه‌دار
          </h1>
          <p className="text-[11px] text-gray-400">
            سقف {((cfg?.dailyLimit ?? 0) / 10).toLocaleString("fa-IR")} تومان |
            سیکل پایا
          </p>
        </div>
        {goldPrice && (
          <div
            className="mr-auto px-3 py-1.5 rounded-xl text-[11px] font-bold"
            style={{ background: "rgba(197,160,89,.1)", color: "#92400e" }}
          >
            🪙 {(goldPrice.price * 1000).toLocaleString("fa-IR")} ت
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* هشدار */}
      <div
        className="mb-4 p-4 rounded-xl text-[12px]"
        style={{
          backgroundColor: "#fef3c7",
          border: "1px solid #fcd34d",
          color: "#78350f",
        }}
      >
        <p className="font-black mb-1">⚠️ توجه مهم</p>
        <p>
          بدلیل مشکلات بانکی تا اطلاع ثانوی از واریز شناسه دار از طریق پل
          خودداری فرمایید.
        </p>
        <p className="mt-1">
          فعلاً شارژ کیف پول همه روزه در بازه ۱۰ صبح تا ۱۴ صورت میگیره.
        </p>
      </div>

      {!info ? (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h2 className="text-[14px] font-black text-gray-800">کارت مبدا</h2>
          <p className="text-[12px] text-gray-500">شماره کارت را انتخاب کنید</p>

          {verifiedCards.length === 0 ? (
            <div className="text-center py-6">
              <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400">
                کارت تایید شده‌ای ندارید
              </p>
              <Link
                href="/dashboard/cards"
                className="inline-block mt-3 px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                افزودن کارت
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {verifiedCards.map((card) => (
                <button
                  key={card.id}
                  onClick={() => {
                    setSelectedCardId(card.id);
                    setError(null);
                  }}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-right ${
                    selectedCardId === card.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <CreditCard
                    className={`w-4 h-4 shrink-0 ${selectedCardId === card.id ? "text-emerald-600" : "text-gray-400"}`}
                  />
                  <div className="flex-1">
                    <p className="text-[13px] font-black text-gray-800">
                      {card.bankName}
                    </p>
                    <p className="text-[12px] text-gray-400" dir="ltr">
                      {card.cardNumber}
                    </p>
                  </div>
                  {selectedCardId === card.id && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleGetInfo}
            disabled={loading || !selectedCardId}
            className="w-full py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "دریافت اطلاعات واریز"
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* واریز شناسه‌دار در ملی‌گلد */}
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 className="text-[14px] font-black text-gray-800">
              واریز شناسه‌دار در ملی‌گلد
            </h2>

            {[
              {
                label: "انتخاب حساب مبدا",
                desc: "واریز فقط از شماره شبای ثبت‌شده در ملی‌گلد قابل انجام است.",
              },
              {
                label: "ثبت شناسه واریز",
                desc: "شماره شبای مقصد (حساب ملی‌گلد) را وارد کنید و حتماً شناسه اختصاصی واریز خود را درج کنید.",
              },
              {
                label: "انجام واریز در اپلیکیشن بانکی یا خودپرداز",
                desc: "از طریق بانکداری اینترنتی، انتقال بانکی (پایا) را انجام دهید.",
              },
              {
                label: "انتظار برای تایید و شارژ کیف پول",
                desc: "بعد از واریز، کیف پول شما در سیکل پایا تا حداکثر ۱۵ دقیقه شارژ خواهد شد. در غیر اینصورت مبلغ در سیکل پایا به کیف پول شما واریز خواهد شد.",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="w-6 h-6 rounded-full text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: "var(--color-emerald)",
                    color: "white",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <p className="text-[13px] font-black text-gray-800">
                    {item.label}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* اطلاعات حساب */}
          <div
            className="rounded-2xl p-5 space-y-3"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h3 className="text-[13px] font-black text-gray-700">
              اطلاعات حساب مقصد
            </h3>
            {[
              { label: "نام بانک", value: info.destinationOwner, copy: false },
              {
                label: "شماره حساب",
                value: info.destinationAccount,
                copy: true,
              },
              { label: "شماره شبا", value: info.destinationSheba, copy: true },
              {
                label: "🔑 شناسه واریز اختصاصی شما",
                value: info.trackingId,
                copy: true,
                highlight: true,
              },
            ].map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-3 py-3 rounded-xl ${row.highlight ? "bg-amber-50 border border-amber-200" : "bg-gray-50"}`}
              >
                <span
                  className={`text-[12px] font-medium ${row.highlight ? "text-amber-800 font-black" : "text-gray-500"}`}
                >
                  {row.label}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[12px] font-black ${row.highlight ? "text-amber-900" : "text-gray-800"}`}
                    dir="ltr"
                  >
                    {row.value}
                  </span>
                  {row.copy && <CopyBtn text={row.value} />}
                </div>
              </div>
            ))}
          </div>

          <Link
            href="/dashboard/wallet"
            className="block w-full py-4 rounded-xl font-black text-white text-[14px] text-center"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            بازگشت به کیف پول
          </Link>
        </div>
      )}
    </div>
  );
}
