"use client";

import { useState } from "react";
import Link from "next/link";
import { useDepositConfig, useCardToCardDeposit } from "@/app/hooks/useWallet";
import { useBankAccounts } from "@/app/hooks/useBankAccounts";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import {
  ChevronLeft,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  CreditCard,
  ArrowDown,
  Clock,
} from "lucide-react";

// ── ریال API → تومان نمایش ──
function rT(rial: number) {
  return (rial / 10).toLocaleString("fa-IR");
}
function rTLabel(rial: number) {
  const t = rial / 10;
  if (t >= 1_000_000_000)
    return `${(t / 1_000_000_000).toLocaleString("fa-IR")} میلیارد`;
  if (t >= 1_000_000)
    return `${(t / 1_000_000).toLocaleString("fa-IR")} میلیون`;
  return t.toLocaleString("fa-IR");
}
// تومان ورودی کاربر → ریال برای API
function tomanToRial(tomanStr: string): number {
  return Number(tomanStr.replace(/,/g, "").replace(/،/g, "")) * 10;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors active:scale-95"
    >
      {copied ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4 text-gray-400" />
      )}
    </button>
  );
}

type Step = "select-card" | "enter-amount" | "show-destination" | "confirmed";

export default function CardToCardPage() {
  const { config } = useDepositConfig();
  const { accounts } = useBankAccounts();
  const { data: goldPrice } = useGoldPrice();
  const { loading, error, setError, initiate, confirm } =
    useCardToCardDeposit();

  const [step, setStep] = useState<Step>("select-card");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [amountToman, setAmountToman] = useState("");
  const [depositInfo, setDepositInfo] = useState<{
    transactionId: string;
    destinationCard: string;
    destinationCardFull: string;
    destinationOwner: string;
    amount: number;
    processingTime: string;
  } | null>(null);

  const cfg = config?.cardToCard;
  const verifiedCards = accounts.filter((a) => a.isVerified);

  // سقف تومانی برای نمایش و validation
  const minToman = cfg ? cfg.minAmount / 10 : 10_000;
  const maxToman = cfg ? cfg.maxAmount / 10 : 15_000_000;

  const handleSelectCard = () => {
    if (!selectedCardId) return setError("یک کارت بانکی انتخاب کنید");
    setError(null);
    setStep("enter-amount");
  };

  const handleSubmitAmount = async () => {
    const amtToman = Number(amountToman.replace(/,/g, "").replace(/،/g, ""));
    if (!amtToman || amtToman < minToman) {
      return setError(
        `حداقل مبلغ ${minToman.toLocaleString("fa-IR")} تومان است`,
      );
    }
    if (amtToman > maxToman) {
      return setError(
        `حداکثر مبلغ ${maxToman.toLocaleString("fa-IR")} تومان است`,
      );
    }
    const amountRial = amtToman * 10;
    const result = await initiate(selectedCardId, amountRial);
    if (result) {
      setDepositInfo(result);
      setStep("show-destination");
    }
  };

  const handleConfirm = async () => {
    if (!depositInfo) return;
    const result = await confirm(depositInfo.transactionId);
    if (result) setStep("confirmed");
  };

  const formatCard = (c: string) => c.replace(/(.{4})/g, "$1 ").trim();

  // مبالغ پیشنهادی بر اساس سقف واقعی
  const quickAmounts = [
    1_000_000,
    5_000_000,
    10_000_000,
    Math.min(15_000_000, maxToman),
  ].filter((v, i, arr) => arr.indexOf(v) === i && v <= maxToman);

  const stepLabels: Step[] = [
    "select-card",
    "enter-amount",
    "show-destination",
  ];

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
          <h1 className="text-[17px] font-black text-gray-900">کارت به کارت</h1>
          {cfg && (
            <p className="text-[11px] text-gray-400">
              سقف روزانه: {rTLabel(cfg.dailyLimit)} تومان
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

      {/* نوار پیشرفت */}
      {step !== "confirmed" && (
        <div className="flex items-center gap-2 mb-5">
          {stepLabels.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black transition-all ${
                  stepLabels.indexOf(step) > i
                    ? "bg-green-500 text-white"
                    : step === s
                      ? "text-white"
                      : "bg-gray-100 text-gray-400"
                }`}
                style={
                  step === s
                    ? { backgroundColor: "var(--color-emerald)" }
                    : undefined
                }
              >
                {stepLabels.indexOf(step) > i ? "✓" : i + 1}
              </div>
              {i < 2 && (
                <div
                  className={`flex-1 h-0.5 rounded-full ${stepLabels.indexOf(step) > i ? "bg-green-400" : "bg-gray-200"}`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* خطا */}
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
              <p className="text-[13px] text-gray-400 font-medium mb-3">
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

          <div className="pt-2 border-t border-gray-100">
            <Link
              href="/dashboard/cards"
              className="text-[12px] font-bold"
              style={{ color: "var(--color-emerald)" }}
            >
              + افزودن کارت جدید
            </Link>
          </div>

          <button
            onClick={handleSelectCard}
            disabled={!selectedCardId}
            className="w-full py-3.5 rounded-xl font-black text-white text-[14px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            ادامه
          </button>
        </div>
      )}

      {/* ══ مرحله ۲: ورود مبلغ ══ */}
      {step === "enter-amount" && (
        <div
          className="rounded-2xl p-5 space-y-5"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div>
            <h2 className="text-[14px] font-black text-gray-800 mb-1">
              مبلغ افزایش اعتبار
            </h2>
            <p className="text-[12px] text-gray-400">
              {minToman.toLocaleString("fa-IR")} ~{" "}
              {maxToman.toLocaleString("fa-IR")} تومان
            </p>
          </div>

          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              placeholder={`${minToman.toLocaleString("fa-IR")} تا ${maxToman.toLocaleString("fa-IR")}`}
              value={amountToman}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setAmountToman(raw ? Number(raw).toLocaleString("fa-IR") : "");
                setError(null);
              }}
              className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[20px] font-black text-gray-800 bg-gray-50 transition-all pr-4 pl-20"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">
              تومان
            </span>
          </div>

          {/* مبالغ پیشنهادی - بر اساس سقف واقعی */}
          <div className="grid grid-cols-4 gap-2">
            {quickAmounts.map((v) => (
              <button
                key={v}
                onClick={() => {
                  setAmountToman(v.toLocaleString("fa-IR"));
                  setError(null);
                }}
                className="py-2.5 rounded-xl text-[11px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
              >
                {v >= 1_000_000
                  ? `${(v / 1_000_000).toLocaleString("fa-IR")}م`
                  : `${(v / 1_000).toLocaleString("fa-IR")}ه`}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("select-card")}
              className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              بازگشت
            </button>
            <button
              onClick={handleSubmitAmount}
              disabled={loading || !amountToman}
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "ادامه"}
            </button>
          </div>
        </div>
      )}

      {/* ══ مرحله ۳: اطلاعات مقصد ══ */}
      {step === "show-destination" && depositInfo && (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 className="text-[14px] font-black text-gray-800">
              مشخصات حساب مقصد
            </h2>

            <div className="rounded-xl overflow-hidden border border-gray-100">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
                <span className="text-[12px] text-gray-500">
                  نام بانک / صاحب حساب
                </span>
                <span className="text-[13px] font-black text-gray-800">
                  {depositInfo.destinationOwner}
                </span>
              </div>
              <div className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-100">
                <span className="text-[12px] text-gray-500">شماره کارت</span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[14px] font-black text-gray-900 tracking-widest"
                    dir="ltr"
                  >
                    {formatCard(depositInfo.destinationCardFull)}
                  </span>
                  <CopyButton text={depositInfo.destinationCardFull} />
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "var(--color-emerald-light)" }}
              >
                <ArrowDown
                  className="w-4 h-4"
                  style={{ color: "var(--color-emerald)" }}
                />
              </div>
            </div>

            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: "rgba(197,160,89,.1)",
                border: "1px solid rgba(197,160,89,.3)",
              }}
            >
              <p className="text-[11px] text-amber-700 mb-1">مبلغ واریز</p>
              <p className="text-[26px] font-black text-amber-900">
                {rT(depositInfo.amount)}
                <span className="text-[14px] font-bold mr-1.5 text-amber-700">
                  تومان
                </span>
              </p>
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
            <p className="font-black text-[13px]">راهنمای واریز کارت به کارت</p>
            {[
              "از کارتی که در حساب‌های بانکی ملی‌گلد ثبت کرده‌اید واریز کنید.",
              "شماره کارت مقصد (حساب ملی‌گلد) را کپی کنید.",
              "از اپلیکیشن بانکی یا خودپرداز مبلغ مورد نظر را واریز کنید.",
              "بعد از واریز، کیف پول شما تا حداکثر ۱۰ دقیقه شارژ خواهد شد.",
            ].map((t, i) => (
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
                <p>{t}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 border border-gray-100">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-[12px] text-gray-600 font-medium">
              {depositInfo.processingTime}
            </span>
          </div>

          <button
            onClick={handleConfirm}
            disabled={loading}
            className="w-full py-4 rounded-xl font-black text-white text-[15px] flex items-center justify-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "واریز را انجام دادم"
            )}
          </button>
        </div>
      )}

      {/* ══ مرحله ۴: تایید ══ */}
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
            درخواست ثبت شد
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-6">
            پس از تایید کارشناسان، مبلغ به کیف پول شما افزوده می‌شود.
          </p>
          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard/wallet"
              className="py-3.5 rounded-xl font-black text-white text-[14px] text-center"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              بازگشت به کیف پول
            </Link>
            <Link
              href="/dashboard/transactions"
              className="py-3.5 rounded-xl font-bold text-[13px] text-center border border-gray-200 text-gray-600"
            >
              مشاهده تراکنش‌ها
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
