"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useDepositConfig,
  useBankTransferDeposit,
} from "@/app/hooks/useWallet";
import { useBankAccounts } from "@/app/hooks/useBankAccounts";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import {
  ChevronLeft,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
  Building2,
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
      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors active:scale-95"
    >
      {ok ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}

type Step = "select-card" | "show-info" | "confirmed";

export default function BankTransferPage() {
  const { config } = useDepositConfig();
  const { accounts } = useBankAccounts();
  const { data: goldPrice } = useGoldPrice();
  const { loading, error, setError, initiate } = useBankTransferDeposit();

  const [step, setStep] = useState<Step>("select-card");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [transferInfo, setTransferInfo] = useState<{
    destinationAccount: string;
    destinationSheba: string;
    destinationOwner: string;
    sourceCardNumber: string;
    processingTime: string;
  } | null>(null);

  const verifiedCards = accounts.filter((a) => a.isVerified);
  const cfg = config?.bankTransfer;

  const handleSelectCard = async () => {
    if (!selectedCardId) return setError("یک کارت بانکی انتخاب کنید");
    const result = await initiate(selectedCardId);
    if (result) {
      setTransferInfo(result);
      setStep("show-info");
    }
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
          <h1 className="text-[17px] font-black text-gray-900">حساب به حساب</h1>
          <p className="text-[11px] text-gray-400">
            واریز بدون محدودیت | {cfg?.processingTime ?? "واریز در سیکل پایا"}
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

      {/* ══ مرحله ۱: انتخاب کارت ══ */}
      {step === "select-card" && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <h2 className="text-[14px] font-black text-gray-800">
            مبداهای مجاز واریز
          </h2>

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
            onClick={handleSelectCard}
            disabled={loading || !selectedCardId}
            className="w-full py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "ادامه"}
          </button>
        </div>
      )}

      {/* ══ مرحله ۲: اطلاعات حساب مقصد ══ */}
      {step === "show-info" && transferInfo && (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h2 className="text-[14px] font-black text-gray-800">
                  {transferInfo.destinationOwner}
                </h2>
                <p className="text-[11px] text-gray-400">مشخصات حساب مقصد</p>
              </div>
            </div>

            <div className="rounded-xl overflow-hidden border border-gray-100">
              {[
                { label: "شماره حساب", value: transferInfo.destinationAccount },
                { label: "شماره شبا", value: transferInfo.destinationSheba },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-4 py-3.5 ${i > 0 ? "border-t border-gray-100" : ""}`}
                  style={{
                    backgroundColor:
                      i % 2 === 0 ? "var(--color-bg-page)" : "white",
                  }}
                >
                  <span className="text-[12px] text-gray-500 font-medium">
                    {row.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[12px] font-black text-gray-800"
                      dir="ltr"
                    >
                      {row.value}
                    </span>
                    <CopyBtn text={row.value} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* راهنما */}
          <div
            className="rounded-xl p-4 space-y-3 text-[12px]"
            style={{
              backgroundColor: "#fefce8",
              border: "1px solid #fef08a",
              color: "#713f12",
            }}
          >
            <p className="font-black text-[13px]">راهنمای واریز حساب به حساب</p>
            {[
              {
                title: "انتخاب کارت مبدأ",
                desc: "واریز فقط از طریق کارت‌هایی که در ملی‌گلد ثبت کرده‌اید انجام می‌شود.",
              },
              {
                title: "کپی شماره حساب مقصد",
                desc: "شماره حساب یا شبای مقصد (حساب ملی‌گلد) را کپی کنید.",
              },
              {
                title: "انجام واریز",
                desc: "از اپلیکیشن بانکی یا خودپرداز مبلغ را واریز کنید.",
              },
              {
                title: "انتظار برای تایید",
                desc: "در صورتیکه مبدا بانک کشاورزی باشد تا ۱۵ دقیقه، در غیر اینصورت در سیکل پایا شارژ می‌شوید.",
              },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <span
                  className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center shrink-0 mt-0.5"
                  style={{
                    backgroundColor: "var(--color-emerald)",
                    color: "white",
                  }}
                >
                  {i + 1}
                </span>
                <div>
                  <span className="font-black">{item.title} — </span>
                  <span>{item.desc}</span>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setStep("confirmed")}
            className="w-full py-4 rounded-xl font-black text-white text-[15px]"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            متوجه شدم
          </button>
        </div>
      )}

      {/* ══ تایید ══ */}
      {step === "confirmed" && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-[18px] font-black text-gray-900 mb-2">
            منتظر واریز شما هستیم
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
            پس از واریز، مبلغ در سیکل پایا به کیف پول شما افزوده می‌شود.
          </p>
          <Link
            href="/dashboard/wallet"
            className="block py-3.5 rounded-xl font-black text-white text-[14px] text-center"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            بازگشت به کیف پول
          </Link>
        </div>
      )}
    </div>
  );
}
