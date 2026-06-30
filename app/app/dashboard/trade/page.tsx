"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/app/hooks/useWallet";
import {
  useMarketPrice,
  usePriceLock,
  useCreateOrder,
  useCountdown,
} from "@/app/hooks/useTrading";
import {
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Scale,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Timer,
  RefreshCw,
  Lock,
  Coins,
} from "lucide-react";

// ── helpers ──
function rT(rial: number) {
  return (rial / 10).toLocaleString("fa-IR");
}
function toRial(tomanStr: string) {
  return Number(tomanStr.replace(/,/g, "").replace(/،/g, "")) * 10;
}

type Side = "BUY" | "SELL";
type InputMode = "gram" | "toman";
type Step = "input" | "lock" | "confirm" | "done";

export default function TradePage() {
  const { wallet, refresh: refreshWallet } = useWallet();
  const {
    price,
    loading: priceLoading,
    refresh: refreshPrice,
  } = useMarketPrice();
  const {
    loading: lockLoading,
    error: lockError,
    setError: setLockError,
    lock,
    lockPrice,
    clearLock,
  } = usePriceLock();
  const {
    loading: orderLoading,
    error: orderError,
    setError: setOrderError,
    createOrder,
  } = useCreateOrder();
  const {
    remaining,
    formatted: countdown,
    expired,
  } = useCountdown(lock?.expiresAt ?? null);

  const [side, setSide] = useState<Side>("BUY");
  const [inputMode, setInputMode] = useState<InputMode>("gram");
  const [gramValue, setGramValue] = useState("");
  const [tomanValue, setTomanValue] = useState("");
  const [step, setStep] = useState<Step>("input");
  const [orderResult, setOrderResult] = useState<{
    message: string;
    amountGrams: number;
    totalToman: number;
    feeToman: number;
  } | null>(null);

  const currentPriceToman = price?.pricePerGramToman ?? 0;

  // ── تبدیل گرم ↔ تومان ──
  const handleGramChange = (val: string) => {
    const raw = val.replace(/[^0-9.]/g, "");
    setGramValue(raw);
    setLockError(null);
    if (raw && currentPriceToman) {
      const toman = Number(raw) * currentPriceToman;
      setTomanValue(Math.round(toman).toLocaleString("fa-IR"));
    } else setTomanValue("");
  };

  const handleTomanChange = (val: string) => {
    const raw = val.replace(/[^0-9]/g, "");
    setTomanValue(raw ? Number(raw).toLocaleString("fa-IR") : "");
    setLockError(null);
    if (raw && currentPriceToman) {
      const gram = Number(raw) / currentPriceToman;
      setGramValue(gram.toFixed(4));
    } else setGramValue("");
  };

  // وقتی قیمت آپدیت شد، مقادیر رو هم آپدیت کن
  useEffect(() => {
    if (gramValue && currentPriceToman) {
      const toman = Number(gramValue) * currentPriceToman;
      setTomanValue(Math.round(toman).toLocaleString("fa-IR"));
    }
  }, [currentPriceToman]);

  // lock منقضی شد → برگشت به input
  useEffect(() => {
    if (expired && step === "lock") {
      setStep("input");
      clearLock();
    }
  }, [expired, step]);

  // ── قفل قیمت ──
  const handleLockPrice = async () => {
    const grams = Number(gramValue);
    if (!grams || grams <= 0) return setLockError("مقدار را وارد کنید");
    const result = await lockPrice(side, grams);
    if (result) setStep("lock");
  };

  // ── ثبت سفارش ──
  const handleCreateOrder = async () => {
    if (!lock) return;
    const result = await createOrder(lock.lockId);
    if (result) {
      setOrderResult({
        message: result.message,
        amountGrams: result.amountGrams,
        totalToman: result.totalToman,
        feeToman: result.feeToman,
      });
      setStep("done");
      refreshWallet();
    }
  };

  // ── تنظیم سریع مقدار ──
  const quickAmounts =
    side === "BUY"
      ? [0.5, 1, 2, 5]
      : [0.1, 0.5, 1, Number(wallet?.goldBalanceGrams.toFixed(4) ?? 0)].filter(
          (v) => v > 0,
        );

  const error = lockError || orderError;

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      {/* ── نوار قیمت لحظه‌ای ── */}
      <div
        className="relative overflow-hidden rounded-2xl p-4 mb-5 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, var(--color-emerald), #2d0f12)",
        }}
      >
        <div
          className="absolute -top-6 -left-6 w-24 h-24 rounded-full opacity-10"
          style={{ background: "var(--color-gold-500)" }}
        />
        <div className="relative z-10">
          <p className="text-[11px] text-white opacity-60 mb-0.5">
            قیمت هر گرم طلای ۱۸ عیار
          </p>
          <div className="flex items-center gap-2">
            {priceLoading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <span className="text-[22px] font-black text-white">
                {currentPriceToman.toLocaleString("fa-IR")}
                <span className="text-[13px] font-bold opacity-70 mr-1">
                  تومان
                </span>
              </span>
            )}
          </div>
          {price && (
            <p className="text-[10px] text-white opacity-50 mt-0.5">
              بروزرسانی: {new Date(price.fetchedAt).toLocaleTimeString("fa-IR")}
            </p>
          )}
        </div>
        <div className="relative z-10 flex flex-col items-end gap-2">
          <button
            onClick={() => refreshPrice()}
            className="p-2 rounded-xl text-white opacity-60 hover:opacity-100 transition-opacity"
            style={{ background: "rgba(255,255,255,.1)" }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-lg"
            style={{ background: "rgba(255,255,255,.1)" }}
          >
            <Coins
              className="w-3 h-3"
              style={{ color: "var(--color-gold-500)" }}
            />
            <span className="text-[10px] text-white opacity-70">
              موجودی: {wallet?.goldBalanceGrams.toFixed(4) ?? "0"} گرم
            </span>
          </div>
        </div>
      </div>

      {/* ── خطا ── */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ══ مرحله ۱: ورود مقدار ══ */}
      {step === "input" && (
        <div className="space-y-4">
          {/* تب خرید/فروش */}
          <div className="flex bg-gray-100 p-1.5 rounded-2xl">
            <button
              onClick={() => {
                setSide("BUY");
                setGramValue("");
                setTomanValue("");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[14px] transition-all ${
                side === "BUY"
                  ? "bg-white text-emerald-600 shadow-sm"
                  : "text-gray-400"
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" /> خرید طلا
            </button>
            <button
              onClick={() => {
                setSide("SELL");
                setGramValue("");
                setTomanValue("");
              }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-[14px] transition-all ${
                side === "SELL"
                  ? "bg-white text-red-500 shadow-sm"
                  : "text-gray-400"
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" /> فروش طلا
            </button>
          </div>

          {/* فرم ورود مقدار */}
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            {/* انتخاب حالت ورودی */}
            <div className="flex gap-2">
              <button
                onClick={() => setInputMode("gram")}
                className={`flex-1 py-2 rounded-xl text-[12px] font-bold transition-all border ${
                  inputMode === "gram"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-400"
                }`}
              >
                گرم
              </button>
              <button
                onClick={() => setInputMode("toman")}
                className={`flex-1 py-2 rounded-xl text-[12px] font-bold transition-all border ${
                  inputMode === "toman"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-gray-200 text-gray-400"
                }`}
              >
                تومان
              </button>
            </div>

            {/* ورودی اصلی */}
            {inputMode === "gram" ? (
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  dir="ltr"
                  placeholder="مثال: ۱.۵"
                  value={gramValue}
                  onChange={(e) => handleGramChange(e.target.value)}
                  className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[22px] font-black text-gray-800 bg-gray-50 transition-all"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">
                  گرم
                </span>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  inputMode="numeric"
                  dir="ltr"
                  placeholder="مبلغ تومان"
                  value={tomanValue}
                  onChange={(e) => handleTomanChange(e.target.value)}
                  className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[22px] font-black text-gray-800 bg-gray-50 transition-all"
                />
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">
                  تومان
                </span>
              </div>
            )}

            {/* نمایش معادل */}
            {gramValue && tomanValue && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: "var(--color-bg-page)" }}
              >
                <Scale className="w-4 h-4 text-gray-400" />
                <span className="text-[12px] text-gray-600 font-medium">
                  {inputMode === "gram"
                    ? `≈ ${tomanValue} تومان`
                    : `≈ ${gramValue} گرم`}
                </span>
              </div>
            )}

            {/* مقادیر پیشنهادی */}
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((v) => (
                <button
                  key={v}
                  onClick={() => handleGramChange(String(v))}
                  className="py-2 rounded-xl text-[11px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                >
                  {v}گ
                </button>
              ))}
            </div>

            {/* موجودی */}
            {side === "BUY" && wallet && (
              <div className="flex items-center justify-between text-[12px] px-1">
                <span className="text-gray-400">موجودی ریال:</span>
                <span className="font-black text-gray-700">
                  {rT(wallet.rialBalance)} تومان
                </span>
              </div>
            )}
            {side === "SELL" && wallet && (
              <div className="flex items-center justify-between text-[12px] px-1">
                <span className="text-gray-400">موجودی طلا:</span>
                <span className="font-black text-gray-700">
                  {wallet.goldBalanceGrams.toFixed(4)} گرم
                </span>
              </div>
            )}
          </div>

          {/* دکمه قفل قیمت */}
          <button
            onClick={handleLockPrice}
            disabled={lockLoading || !gramValue || !currentPriceToman}
            className={`w-full py-4 rounded-2xl font-black text-white text-[15px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 shadow-lg ${
              side === "BUY"
                ? "bg-gradient-to-l from-emerald-600 to-emerald-500"
                : "bg-gradient-to-l from-red-600 to-red-500"
            }`}
            style={{
              boxShadow:
                side === "BUY"
                  ? "0 8px 20px rgba(22,163,74,.3)"
                  : "0 8px 20px rgba(239,68,68,.3)",
            }}
          >
            {lockLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Lock className="w-4 h-4" />
                {side === "BUY"
                  ? "قفل قیمت و ادامه خرید"
                  : "قفل قیمت و ادامه فروش"}
              </>
            )}
          </button>
        </div>
      )}

      {/* ══ مرحله ۲: تایید با تایمر ══ */}
      {step === "lock" && lock && (
        <div className="space-y-4">
          {/* تایمر */}
          <div
            className={`flex items-center justify-between px-5 py-3 rounded-2xl ${
              remaining <= 30
                ? "bg-red-50 border border-red-200"
                : "bg-amber-50 border border-amber-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <Timer
                className={`w-4 h-4 ${remaining <= 30 ? "text-red-500" : "text-amber-600"}`}
              />
              <span
                className={`text-[13px] font-bold ${remaining <= 30 ? "text-red-600" : "text-amber-700"}`}
              >
                قیمت قفل شده - زمان باقیمانده:
              </span>
            </div>
            <span
              className={`text-[20px] font-black tabular-nums ${remaining <= 30 ? "text-red-600" : "text-amber-800"}`}
              dir="ltr"
            >
              {countdown}
            </span>
          </div>

          {/* جزئیات سفارش */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid var(--color-border)" }}
          >
            <div
              className="px-5 py-3 flex items-center gap-2"
              style={{
                backgroundColor: side === "BUY" ? "#f0fdf4" : "#fef2f2",
              }}
            >
              {side === "BUY" ? (
                <ArrowDownCircle className="w-4 h-4 text-emerald-600" />
              ) : (
                <ArrowUpCircle className="w-4 h-4 text-red-500" />
              )}
              <span
                className={`text-[14px] font-black ${side === "BUY" ? "text-emerald-700" : "text-red-600"}`}
              >
                {side === "BUY" ? "سفارش خرید طلا" : "سفارش فروش طلا"}
              </span>
            </div>

            {[
              { label: "مقدار", value: `${lock.amountGrams} گرم`, big: false },
              {
                label: "قیمت قفل‌شده هر گرم",
                value: `${lock.lockedPriceToman.toLocaleString("fa-IR")} تومان`,
                big: false,
              },
              {
                label: "ارزش طلا",
                value: `${lock.totalToman.toLocaleString("fa-IR")} تومان`,
                big: false,
              },
              {
                label: `کارمزد (${lock.feePercent}٪)`,
                value: `${lock.feeToman.toLocaleString("fa-IR")} تومان`,
                big: false,
              },
              ...(lock.taxToman > 0
                ? [
                    {
                      label: "مالیات",
                      value: `${lock.taxToman.toLocaleString("fa-IR")} تومان`,
                      big: false,
                    },
                  ]
                : []),
              {
                label: side === "BUY" ? "مبلغ پرداختی" : "مبلغ دریافتی",
                value: `${lock.totalPayableToman.toLocaleString("fa-IR")} تومان`,
                big: true,
              },
            ].map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-3.5 border-t border-gray-100 ${
                  row.big ? "bg-gray-50" : "bg-white"
                }`}
              >
                <span className="text-[12px] text-gray-500 font-medium">
                  {row.label}
                </span>
                <span
                  className={`font-black ${row.big ? "text-[17px] text-gray-900" : "text-[13px] text-gray-700"}`}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* بررسی موجودی */}
          {side === "BUY" &&
            wallet &&
            lock.totalPayableRial > wallet.rialBalance && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                موجودی ریال کافی نیست
              </div>
            )}

          <div className="flex gap-3">
            <button
              onClick={() => {
                setStep("input");
                clearLock();
              }}
              className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              انصراف
            </button>
            <button
              onClick={handleCreateOrder}
              disabled={
                orderLoading ||
                (side === "BUY" &&
                  !!wallet &&
                  lock.totalPayableRial > wallet.rialBalance)
              }
              className={`flex-[2] py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-50 ${
                side === "BUY" ? "bg-emerald-500" : "bg-red-500"
              }`}
            >
              {orderLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : side === "BUY" ? (
                "تایید و خرید"
              ) : (
                "تایید و فروش"
              )}
            </button>
          </div>
        </div>
      )}

      {/* ══ مرحله ۳: نتیجه ══ */}
      {step === "done" && orderResult && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              side === "BUY" ? "bg-emerald-100" : "bg-red-100"
            }`}
          >
            <CheckCircle2
              className={`w-9 h-9 ${side === "BUY" ? "text-emerald-500" : "text-red-500"}`}
            />
          </div>
          <h2 className="text-[18px] font-black text-gray-900 mb-2">
            {orderResult.message}
          </h2>

          <div className="space-y-2 my-5 text-right">
            <div className="flex justify-between px-4 py-3 rounded-xl bg-gray-50">
              <span className="text-[12px] text-gray-500">مقدار</span>
              <span className="text-[13px] font-black">
                {orderResult.amountGrams} گرم
              </span>
            </div>
            <div className="flex justify-between px-4 py-3 rounded-xl bg-gray-50">
              <span className="text-[12px] text-gray-500">مبلغ کل</span>
              <span className="text-[13px] font-black">
                {rT(orderResult.totalToman * 10)} تومان
              </span>
            </div>
            <div className="flex justify-between px-4 py-3 rounded-xl bg-gray-50">
              <span className="text-[12px] text-gray-500">کارمزد</span>
              <span className="text-[13px] font-black">
                {rT(orderResult.feeToman * 10)} تومان
              </span>
            </div>
          </div>

          {/* موجودی جدید */}
          {wallet && (
            <div
              className="flex items-center justify-center gap-4 py-3 rounded-xl mb-5"
              style={{ backgroundColor: "var(--color-emerald-light)" }}
            >
              <div className="text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">موجودی طلا</p>
                <p
                  className="text-[14px] font-black"
                  style={{ color: "var(--color-emerald)" }}
                >
                  {wallet.goldBalanceGrams.toFixed(4)} گ
                </p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div className="text-center">
                <p className="text-[10px] text-gray-500 mb-0.5">موجودی ریال</p>
                <p
                  className="text-[14px] font-black"
                  style={{ color: "var(--color-emerald)" }}
                >
                  {rT(wallet.rialBalance)} ت
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setStep("input");
                setGramValue("");
                setTomanValue("");
                clearLock();
              }}
              className="py-3.5 rounded-xl font-black text-white text-[14px]"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              معامله جدید
            </button>
            <a
              href="/dashboard/transactions"
              className="py-3.5 rounded-xl font-bold text-[13px] border border-gray-200 text-gray-600 text-center block"
            >
              مشاهده تراکنش‌ها
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
