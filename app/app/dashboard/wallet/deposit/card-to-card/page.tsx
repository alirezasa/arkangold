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

function toToman(rial: number) {
  return (rial / 10).toLocaleString("fa-IR");
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg transition-colors hover:bg-gray-100 active:scale-95"
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
  const [amount, setAmount] = useState("");
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

  // ── مرحله ۱: انتخاب کارت ──
  const handleSelectCard = () => {
    if (!selectedCardId) return setError("یک کارت بانکی انتخاب کنید");
    setError(null);
    setStep("enter-amount");
  };

  // ── مرحله ۲: ثبت مبلغ و دریافت اطلاعات مقصد ──
  const handleSubmitAmount = async () => {
    const amountRial = Number(amount.replace(/,/g, "")) * 10;
    if (!amountRial || amountRial < (cfg?.minAmount ?? 100000)) {
      return setError(
        `حداقل مبلغ ${toToman(cfg?.minAmount ?? 100000)} تومان است`,
      );
    }
    if (amountRial > (cfg?.maxAmount ?? 150000000)) {
      return setError(
        `حداکثر مبلغ ${toToman(cfg?.maxAmount ?? 150000000)} تومان است`,
      );
    }
    const result = await initiate(selectedCardId, amountRial);
    if (result) {
      setDepositInfo(result);
      setStep("show-destination");
    }
  };

  // ── مرحله ۳: تایید انجام واریز ──
  const handleConfirm = async () => {
    if (!depositInfo) return;
    const result = await confirm(depositInfo.transactionId);
    if (result) setStep("confirmed");
  };

  const formatCard = (card: string) => card.replace(/(.{4})/g, "$1 ").trim();

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      {/* ── هدر ── */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet/deposit"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">کارت به کارت</h1>
          <p className="text-[11px] text-gray-400">
            سقف روزانه: {toToman(cfg?.dailyLimit ?? 0)} تومان
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

      {/* ── نوار پیشرفت ── */}
      {step !== "confirmed" && (
        <div className="flex items-center gap-2 mb-6">
          {(["select-card", "enter-amount", "show-destination"] as Step[]).map(
            (s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black transition-all ${
                    step === s
                      ? "text-white"
                      : ["enter-amount", "show-destination"].indexOf(step) >
                          ["enter-amount", "show-destination"].indexOf(s)
                        ? "bg-green-500 text-white"
                        : "bg-gray-100 text-gray-400"
                  }`}
                  style={
                    step === s
                      ? { backgroundColor: "var(--color-emerald)" }
                      : undefined
                  }
                >
                  {i + 1}
                </div>
                {i < 2 && (
                  <div
                    className={`flex-1 h-0.5 rounded-full ${
                      ["enter-amount", "show-destination"].indexOf(step) > i
                        ? "bg-green-400"
                        : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ),
          )}
        </div>
      )}

      {/* ── خطا ── */}
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
            <div className="text-center py-6">
              <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400 font-medium">
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
                      : "border-gray-100 bg-gray-50 hover:border-gray-200"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedCardId === card.id ? "bg-emerald-100" : "bg-white"
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
                    <p
                      className="text-[12px] text-gray-400 font-medium"
                      dir="ltr"
                    >
                      {card.cardNumber}
                    </p>
                  </div>
                  {selectedCardId === card.id && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="pt-2 border-t border-gray-100">
            <Link
              href="/dashboard/cards"
              className="flex items-center gap-2 text-[12px] font-bold"
              style={{ color: "var(--color-emerald)" }}
            >
              <span>+ افزودن کارت جدید</span>
            </Link>
          </div>

          <button
            onClick={handleSelectCard}
            disabled={!selectedCardId}
            className="w-full py-3.5 rounded-xl font-black text-white text-[14px] transition-all disabled:opacity-40"
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
              {toToman(cfg?.minAmount ?? 0)} ~ {toToman(cfg?.maxAmount ?? 0)}{" "}
              تومان
            </p>
          </div>

          {/* ورودی مبلغ */}
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              placeholder="مبلغ را وارد کنید"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setAmount(Number(raw).toLocaleString("fa-IR"));
                setError(null);
              }}
              className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[20px] font-black text-gray-800 bg-gray-50 transition-all"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">
              تومان
            </span>
          </div>

          {/* مبالغ پیشنهادی */}
          <div className="grid grid-cols-4 gap-2">
            {[1_000_000, 5_000_000, 10_000_000, 25_000_000].map((v) => (
              <button
                key={v}
                onClick={() => {
                  setAmount(v.toLocaleString("fa-IR"));
                  setError(null);
                }}
                className="py-2 rounded-xl text-[11px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
              >
                {v >= 1_000_000 ? `${v / 1_000_000}م` : `${v / 1000}ه`}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("select-card")}
              className="flex-1 py-3.5 rounded-xl font-bold text-[14px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              بازگشت
            </button>
            <button
              onClick={handleSubmitAmount}
              disabled={loading || !amount}
              className="flex-2 grow-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-50"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "ادامه"}
            </button>
          </div>
        </div>
      )}

      {/* ══ مرحله ۳: نمایش اطلاعات مقصد ══ */}
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

            {/* اطلاعات کارت مقصد */}
            <div
              className="rounded-xl p-4 space-y-3"
              style={{ backgroundColor: "var(--color-bg-page)" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-500 font-medium">
                  نام بانک
                </span>
                <span className="text-[13px] font-black text-gray-800">
                  {depositInfo.destinationOwner}
                </span>
              </div>
              <div className="h-px bg-gray-200" />
              <div className="flex items-center justify-between">
                <span className="text-[12px] text-gray-500 font-medium">
                  شماره کارت
                </span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-[13px] font-black text-gray-800 tracking-widest"
                    dir="ltr"
                  >
                    {formatCard(depositInfo.destinationCardFull)}
                  </span>
                  <CopyButton text={depositInfo.destinationCardFull} />
                </div>
              </div>
            </div>

            {/* فلش */}
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

            {/* مبلغ */}
            <div
              className="rounded-xl p-4 text-center"
              style={{
                background: "rgba(197,160,89,.1)",
                border: "1px solid rgba(197,160,89,.3)",
              }}
            >
              <p className="text-[12px] text-amber-700 mb-1">مبلغ واریز</p>
              <p className="text-[24px] font-black text-amber-900">
                {toToman(depositInfo.amount)}
                <span className="text-[14px] font-bold mr-1">تومان</span>
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
            <p className="font-black">راهنمای واریز کارت به کارت</p>
            {[
              "انتخاب کارت مبدأ — از طریق کارت، از شماره کارتی که در حساب‌های بانکی ملی‌گلد ثبت کرده‌اید اقدام کنید.",
              "کپی شماره کارت مقصد — شماره کارت مقصد (حساب ملی‌گلد) را کپی کنید.",
              "انجام واریز در اپلیکیشن بانکی یا خودپرداز — با استفاده از شماره کارت مقصد، مبلغ مورد نظر را واریز کنید.",
              "انتظار برای تایید و شارژ کیف پول — بعد از واریز، کیف پول شما تا حداکثر ۱۵ دقیقه شارژ خواهد شد.",
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

          {/* زمان پردازش */}
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
            پس از تایید کارشناسان، مبلغ به کیف پول شما افزوده می‌شود. این فرآیند
            معمولاً کمتر از ۱۵ دقیقه طول می‌کشد.
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
              className="py-3.5 rounded-xl font-bold text-[13px] text-center border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              مشاهده تراکنش‌ها
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
