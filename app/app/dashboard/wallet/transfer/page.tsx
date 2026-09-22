"use client";
import { useState } from "react";
import Link from "next/link";
import {
  useWallet,
  useTransferConfig,
  useInternalTransfer,
} from "@/app/hooks/useWallet";
import {
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send,
  Coins,
  Info,
} from "lucide-react";

// تبدیل ارقام فارسی/عربی به انگلیسی؛ نقطه اعشار هم نگه داشته می‌شود
function toEnglishDigits(str: string): string {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  const arabic = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return str
    .replace(/[۰-۹]/g, (ch) => String(persian.indexOf(ch)))
    .replace(/[٠-٩]/g, (ch) => String(arabic.indexOf(ch)))
    .replace(/[^0-9.]/g, "");
}

function LimitBar({
  used,
  total,
  label,
}: {
  used: number;
  total: number;
  label: string;
}) {
  // سقف صفر یا خیلی بزرگ در بک‌اند به معنای «بدون محدودیت» است
  const unlimited = total <= 0 || total > 1_000_000_000_000;
  const pct = !unlimited && total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
  return (
    <div>
      <div className="flex justify-between text-[11px] font-bold text-gray-500 mb-1.5">
        <span>{label}</span>
        <span>
          {unlimited
            ? "بدون محدودیت"
            : `${used.toLocaleString("fa-IR")} / ${total.toLocaleString("fa-IR")} گرم`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}

type Step = "enter" | "confirm" | "done";

export default function TransferPage() {
  const { wallet, refresh: refreshWallet } = useWallet();
  const { config, refresh: refreshConfig } = useTransferConfig();
  const { loading, error, setError, transfer } = useInternalTransfer();

  const [step, setStep] = useState<Step>("enter");
  const [destinationCard, setDestinationCard] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{
    destinationCardNumber: string;
    amountGrams: number;
  } | null>(null);

  const amountGrams = Number(amount || 0);

  const remainingToday = config?.remainingTodayGrams ?? 0;
  const remainingMonth = config?.remainingThisMonthGrams ?? 0;
  const availableGrams = wallet?.availableGrams ?? 0;
  const maxPossible = Math.min(remainingToday, remainingMonth, availableGrams);

  const handleCardChange = (raw: string) => {
    const digits = raw.replace(/[^\d۰-۹٠-٩]/g, "");
    const normalized = toEnglishDigits(digits).slice(0, 16);
    setDestinationCard(normalized);
    if (error) setError(null);
  };

  const handleAmountChange = (raw: string) => {
    setAmount(toEnglishDigits(raw));
    if (error) setError(null);
  };

  const handleSubmit = () => {
    if (destinationCard.length !== 16) {
      return setError("شماره کارت مقصد باید ۱۶ رقم باشد");
    }
    if (wallet && destinationCard === wallet.cardNumber) {
      return setError("امکان انتقال به کیف پول خودتان وجود ندارد");
    }
    if (!amountGrams || amountGrams <= 0) {
      return setError("مقدار طلای مورد نظر برای انتقال را وارد کنید");
    }
    if (amountGrams > maxPossible) {
      return setError(
        `حداکثر مقدار قابل انتقال ${maxPossible.toLocaleString("fa-IR")} گرم است`,
      );
    }
    setError(null);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    const res = await transfer(destinationCard, amountGrams);
    if (res) {
      setResult(res);
      setStep("done");
      refreshWallet();
      refreshConfig();
    }
  };

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">
            انتقال طلا
          </h1>
          <p className="text-[11px] text-gray-400">
            انتقال طلای آبشده به کیف پول کاربر دیگر
          </p>
        </div>
      </div>

      {/* ── موجودی طلا ── */}
      {wallet && (
        <div
          className="rounded-2xl p-4 mb-4 flex items-center justify-between"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div>
            <p className="text-[11px] text-gray-400 mb-0.5">موجودی طلا</p>
            <p className="text-[18px] font-black text-gray-800">
              {wallet.goldBalanceGrams.toFixed(4)}
              <span className="text-[11px] font-bold text-gray-400 mr-1">
                گرم
              </span>
            </p>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-gray-400 mb-0.5">قابل انتقال</p>
            <p className="text-[16px] font-black text-green-600">
              {availableGrams.toFixed(4)}
              <span className="text-[11px] font-bold text-gray-400 mr-1">
                گرم
              </span>
            </p>
          </div>
        </div>
      )}

      {/* ── سقف‌های انتقال ── */}
      {config && step === "enter" && (
        <div
          className="rounded-2xl p-4 mb-4 space-y-3"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="text-[12px] font-black text-gray-700 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            محدودیت‌های انتقال طلا
          </p>
          <LimitBar
            used={config.usedTodayGrams}
            total={config.dailyLimitGrams}
            label="انتقال روزانه"
          />
          <LimitBar
            used={config.usedThisMonthGrams}
            total={config.monthlyLimitGrams}
            label="انتقال ماهانه"
          />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ══ مرحله ۱: فرم انتقال ══ */}
      {step === "enter" && (
        <div
          className="rounded-2xl p-5 space-y-5"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          {/* شماره کارت مقصد */}
          <div>
            <h2 className="text-[13px] font-black text-gray-800 mb-2">
              شماره کارت شتابی مقصد
            </h2>
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              placeholder="XXXX XXXX XXXX XXXX"
              value={destinationCard.replace(/(.{4})/g, "$1 ").trim()}
              onChange={(e) => handleCardChange(e.target.value)}
              maxLength={19}
              className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[16px] font-bold text-gray-800 bg-gray-50 tracking-widest transition-all"
            />
          </div>

          {/* مقدار طلا */}
          <div>
            <h2 className="text-[13px] font-black text-gray-800 mb-1">
              مقدار طلا (گرم)
            </h2>
            <p className="text-[11px] text-gray-400 mb-2">
              حداکثر قابل انتقال: {maxPossible.toLocaleString("fa-IR")} گرم
            </p>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder="0.0000"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[20px] font-black text-gray-800 bg-gray-50 transition-all"
              />
              <button
                onClick={() => handleAmountChange(String(maxPossible))}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-bold px-2 py-1 rounded-lg"
                style={{
                  backgroundColor: "var(--color-emerald-light)",
                  color: "var(--color-emerald)",
                }}
              >
                حداکثر
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!destinationCard || !amount}
            className="w-full py-3.5 rounded-xl font-black text-white text-[14px] disabled:opacity-40"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            ادامه
          </button>
        </div>
      )}

      {/* ══ مرحله ۲: تایید نهایی ══ */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <h2 className="text-[14px] font-black text-gray-800">
              تایید انتقال طلا
            </h2>

            {[
              {
                label: "مقدار طلا",
                value: `${amountGrams.toLocaleString("fa-IR")} گرم`,
                big: true,
              },
              {
                label: "شماره کارت مقصد",
                value: destinationCard.replace(/(.{4})/g, "$1 ").trim(),
                ltr: true,
              },
            ].map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
              >
                <span className="text-[12px] text-gray-500 font-medium">
                  {row.label}
                </span>
                <span
                  className={`font-black ${row.big ? "text-[18px] text-gray-900" : "text-[13px] text-gray-700"}`}
                  dir={row.ltr ? "ltr" : undefined}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          <div
            className="flex items-start gap-3 p-4 rounded-xl text-[12px]"
            style={{
              backgroundColor: "#fefce8",
              border: "1px solid #fef08a",
              color: "#713f12",
            }}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              انتقال طلا به کیف پول در همان لحظه و بدون کارمزد انجام می‌شود.
              پیش از تایید، شماره کارت مقصد را با دقت بررسی کنید.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("enter")}
              className="flex-1 py-3.5 rounded-xl font-bold text-[14px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              بازگشت
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  تایید و انتقال
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ══ مرحله ۳: انجام شد ══ */}
      {step === "done" && result && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-[18px] font-black text-gray-900 mb-2">
            انتقال طلا با موفقیت انجام شد
          </h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-2 flex items-center justify-center gap-1.5">
            <Coins className="w-4 h-4 text-gold-500" />
            مقدار{" "}
            <span className="font-black text-gray-800">
              {result.amountGrams.toLocaleString("fa-IR")} گرم طلا
            </span>
          </p>
          <p className="text-[12px] text-gray-400 mb-6" dir="ltr">
            به کارت {result.destinationCardNumber}
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard/wallet"
              className="py-3.5 rounded-xl font-black text-white text-[14px]"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              بازگشت به کیف پول
            </Link>
            <Link
              href="/dashboard/transactions"
              className="py-3.5 rounded-xl font-bold text-[13px] border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              مشاهده تراکنش‌ها
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
