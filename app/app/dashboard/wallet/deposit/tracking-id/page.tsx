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
  Fingerprint,
  TriangleAlert,
} from "lucide-react";

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-gray-100 transition-colors active:scale-95"
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-gray-400" />
      )}
      {label && (
        <span className="text-[11px] font-bold text-gray-400">
          {ok ? "کپی شد" : label}
        </span>
      )}
    </button>
  );
}

// ریال → تومان نمایش
function rT(rial: number) {
  const t = rial / 10;
  if (t >= 1_000_000_000)
    return `${(t / 1_000_000_000).toLocaleString("fa-IR")} میلیارد تومان`;
  if (t >= 1_000_000)
    return `${(t / 1_000_000).toLocaleString("fa-IR")} میلیون تومان`;
  return `${t.toLocaleString("fa-IR")} تومان`;
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
      {/* هدر */}
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
          {cfg && (
            <p className="text-[11px] text-gray-400">
              سقف {rT(cfg.dailyLimit)} | سیکل پایا
            </p>
          )}
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

      {/* هشدار مهم */}
      <div
        className="mb-4 p-4 rounded-xl flex items-start gap-3 text-[12px]"
        style={{
          backgroundColor: "#fef3c7",
          border: "1px solid #fcd34d",
          color: "#78350f",
        }}
      >
        <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
        <div className="space-y-1">
          <p className="font-black">⚠️ توجه مهم</p>
          <p>
            بدلیل مشکلات بانکی تا اطلاع ثانوی از واریز شناسه‌دار از طریق پل
            خودداری فرمایید.
          </p>
          <p>فعلاً شارژ کیف پول همه روزه در بازه ۱۰ صبح تا ۱۴ صورت می‌گیرد.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ══ انتخاب کارت ══ */}
      {!info && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2">
            <Fingerprint
              className="w-5 h-5"
              style={{ color: "var(--color-emerald)" }}
            />
            <h2 className="text-[14px] font-black text-gray-800">کارت مبدا</h2>
          </div>
          <p className="text-[12px] text-gray-500">
            شماره کارت را انتخاب کنید تا شناسه اختصاصی واریز شما نمایش داده شود
          </p>

          {verifiedCards.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-[13px] text-gray-400 mb-3">
                کارت تایید شده‌ای ندارید
              </p>
              <Link
                href="/dashboard/cards"
                className="inline-block px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                افزودن کارت بانکی
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
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-right ${
                    selectedCardId === card.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-100 bg-gray-50 hover:border-gray-300"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      selectedCardId === card.id
                        ? "bg-emerald-100"
                        : "bg-white border border-gray-200"
                    }`}
                  >
                    <CreditCard
                      className={`w-4 h-4 ${selectedCardId === card.id ? "text-emerald-600" : "text-gray-400"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-gray-800">
                      {card.bankName}
                    </p>
                    <p className="text-[12px] text-gray-400 mt-0.5" dir="ltr">
                      {card.cardNumber}
                    </p>
                  </div>
                  {selectedCardId === card.id && (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
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
      )}

      {/* ══ نمایش اطلاعات واریز ══ */}
      {info && (
        <div className="space-y-4">
          {/* راهنمای مراحل */}
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 className="text-[14px] font-black text-gray-800">
              واریز شناسه‌دار
            </h2>
            {[
              {
                title: "انتخاب حساب مبدا",
                desc: "واریز فقط از شماره شبای ثبت‌شده در ملی‌گلد قابل انجام است.",
              },
              {
                title: "ثبت شناسه واریز",
                desc: "شماره شبای مقصد را وارد کنید و حتماً شناسه اختصاصی واریز خود را در قسمت شناسه پایا درج کنید.",
              },
              {
                title: "انجام واریز در اپلیکیشن بانکی",
                desc: "از طریق بانکداری اینترنتی، انتقال بانکی (پایا) را انجام دهید.",
              },
              {
                title: "انتظار برای تایید و شارژ کیف پول",
                desc: "بعد از واریز، کیف پول در سیکل پایا شارژ خواهد شد.",
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
                    {item.title}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* اطلاعات حساب مقصد */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid var(--color-border)" }}
          >
            {/* هدر */}
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              <Fingerprint className="w-4 h-4 text-white opacity-80" />
              <span className="text-[13px] font-black text-white">
                اطلاعات واریز
              </span>
            </div>

            {[
              {
                label: "نام بانک / صاحب حساب",
                value: info.destinationOwner,
                copy: false,
                highlight: false,
              },
              {
                label: "شماره حساب",
                value: info.destinationAccount,
                copy: true,
                highlight: false,
              },
              {
                label: "شماره شبا",
                value: info.destinationSheba,
                copy: true,
                highlight: false,
              },
              {
                label: "🔑 شناسه واریز اختصاصی شما",
                value: info.trackingId,
                copy: true,
                highlight: true,
              },
            ].map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-4 py-4 ${
                  i > 0 ? "border-t border-gray-100" : ""
                } ${row.highlight ? "bg-amber-50" : "bg-white"}`}
              >
                <span
                  className={`text-[12px] font-medium ${row.highlight ? "text-amber-800 font-black" : "text-gray-500"}`}
                >
                  {row.label}
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[12px] font-black ${row.highlight ? "text-amber-900 text-[14px]" : "text-gray-800"}`}
                    dir="ltr"
                  >
                    {row.value}
                  </span>
                  {row.copy && <CopyBtn text={row.value} />}
                </div>
              </div>
            ))}
          </div>

          {/* تأکید روی شناسه */}
          <div
            className="p-4 rounded-xl flex items-start gap-3 text-[12px]"
            style={{
              backgroundColor: "#fef3c7",
              border: "1px solid #fcd34d",
              color: "#78350f",
            }}
          >
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-black mb-1">شناسه واریز را فراموش نکنید!</p>
              <p>
                حتماً شناسه واریز اختصاصی خود را در قسمت شناسه پایا وارد کنید.
                بدون شناسه، مبلغ واریزی به حساب شما شارژ نخواهد شد.
              </p>
            </div>
          </div>

          <Link
            href="/dashboard/wallet"
            className="block w-full py-4 rounded-xl font-black text-white text-[14px] text-center"
            style={{ backgroundColor: "var(--color-yellow)" }}
          >
            بازگشت به کیف پول
          </Link>
        </div>
      )}
    </div>
  );
}
