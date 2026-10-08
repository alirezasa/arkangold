"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  useMarketPrice,
  usePriceHistory,
  useTradeInfo,
} from "@/app/hooks/useTrading";
import { useWallet } from "@/app/hooks/useWallet";
import { useTradeCalculator } from "@/app/hooks/useTradeCalculator";
import { TradeModal } from "@/app/dashboard/components/trading/TradeModal";
import {
  ChevronRight,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  Coins,
  Info,
  Scale,
  Banknote,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  AlertCircle,
  Clock,
} from "lucide-react";

// ── helper ──
function rT(rial: number): string {
  const t = rial / 10;
  if (t >= 1_000_000_000)
    return `${(t / 1_000_000_000).toLocaleString("fa-IR")} م.م`;
  if (t >= 1_000_000)
    return `${(t / 1_000_000).toLocaleString("fa-IR")} میلیون`;
  return Math.round(t).toLocaleString("fa-IR");
}

// ── کامپوننت کوچک نمودار تاریخچه ──
function MiniChart({ data }: { data: { priceToman: string | number }[] }) {
  if (!data.length) return null;

  const prices = data.map((d) => Number(d.priceToman));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * 300;
      const y = 50 - ((p - min) / range) * 40;
      return `${x},${y}`;
    })
    .join(" ");

  const isPositive = prices[prices.length - 1] >= prices[0];

  return (
    <svg
      viewBox="0 0 300 60"
      className="w-full h-12"
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "#22c55e" : "#ef4444"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** عدد (رشته/عدد) → نمایش فارسی با حداکثر ۴ رقم اعشار */
function faNum(v: string | number | null | undefined, digits = 4): string {
  const n = Number(v ?? 0);
  return (Number.isFinite(n) ? n : 0).toLocaleString("fa-IR", {
    maximumFractionDigits: digits,
  });
}

// ── مقادیر پیشنهادی ──
const BUY_QUICK = [0.5, 1, 2, 5];
const SELL_QUICK_TOMAN = [500_000, 1_000_000, 5_000_000, 10_000_000];

export default function MeltedGoldPage() {
  // useSearchParams در صفحه‌ی static نیازمند Suspense است
  return (
    <Suspense fallback={null}>
      <MeltedGoldContent />
    </Suspense>
  );
}

function MeltedGoldContent() {
  // لینک‌های «فروش طلا» (نمودار، میان‌بر PWA) با ?side=sell مستقیم تب فروش را باز می‌کنند
  const side = useSearchParams().get("side");
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">(
    side?.toLowerCase() === "sell" ? "SELL" : "BUY",
  );
  const [inputMode, setInputMode] = useState<"gram" | "toman">("gram");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    price: marketPriceData,
    loading: priceLoading,
    refresh: refreshPrice,
  } = useMarketPrice();
  const { history } = usePriceHistory(24);
  const { wallet, loading: walletLoading } = useWallet();
  const { info: tradeInfo, refresh: refreshTradeInfo } = useTradeInfo();

  const currentPriceToman = marketPriceData?.pricePerGramToman
    ? parseFloat(String(marketPriceData.pricePerGramToman))
    : null;

  const change24h = Number(marketPriceData?.change24h ?? 0) || 0;

  const {
    amountToman,
    weightGrams,
    handleAmountChange,
    handleWeightChange,
    reset,
  } = useTradeCalculator(currentPriceToman);

  const isBuy = tradeType === "BUY";
  const sideInfo = tradeInfo ? (isBuy ? tradeInfo.buy : tradeInfo.sell) : null;
  const minGrams = Number(tradeInfo?.minGrams ?? 0.1);
  const maxGrams = Number(tradeInfo?.maxGrams ?? 0);
  const feePercent = Number(sideInfo?.feePercent ?? 0);
  const taxPercent = Number(sideInfo?.taxPercent ?? 0);
  const spreadPercent = Number(tradeInfo?.spreadPercent ?? 0);
  const availableGrams = wallet?.availableGrams ?? 0;

  // برآورد مبلغ نهایی با اسپرد، کارمزد و مالیات (مبلغ قطعی در پیش‌فاکتور قفل می‌شود)
  const grams = parseFloat(weightGrams) || 0;
  const estimate = (() => {
    if (!currentPriceToman || grams <= 0) return null;
    const unit =
      currentPriceToman * (1 + ((isBuy ? 1 : -1) * spreadPercent) / 100);
    const value = grams * unit;
    const charges = (value * (feePercent + taxPercent)) / 100;
    return {
      value,
      charges,
      net: isBuy ? value + charges : value - charges,
    };
  })();

  // دلیل غیرفعال بودن معامله (خدمت خاموش، قیمت کهنه، بسته بودن بازار)
  const blockedReason = !tradeInfo
    ? null
    : !tradeInfo.serviceEnabled
      ? "خرید و فروش طلای آب‌شده در حال حاضر غیرفعال است."
      : !tradeInfo.priceAvailable
        ? "قیمت بازار در حال به‌روزرسانی است. لطفاً چند لحظه دیگر تلاش کنید."
        : sideInfo && !sideInfo.enabled
          ? `${isBuy ? "خرید" : "فروش"} طلا در حال حاضر به دلیل بسته بودن بازار امکان‌پذیر نیست.`
          : null;

  // ── validation و باز کردن مودال ──
  const handleOpenModal = () => {
    setFormError(null);

    if (blockedReason) {
      setFormError(blockedReason);
      return;
    }
    if (!grams || grams <= 0) {
      setFormError("مقدار طلا را وارد کنید.");
      return;
    }
    if (grams < minGrams) {
      setFormError(`حداقل مقدار معامله ${faNum(minGrams)} گرم است.`);
      return;
    }
    if (maxGrams > 0 && grams > maxGrams) {
      setFormError(`حداکثر مقدار هر معامله ${faNum(maxGrams)} گرم است.`);
      return;
    }
    if (!currentPriceToman) {
      setFormError("قیمت لحظه‌ای در دسترس نیست. لطفاً صفحه را رفرش کنید.");
      return;
    }
    const remainingToday = sideInfo?.remainingTodayGrams;
    if (remainingToday != null && grams > Number(remainingToday)) {
      setFormError(
        `سقف ${isBuy ? "خرید" : "فروش"} روزانه ${faNum(sideInfo?.dailyLimitGrams)} گرم است. باقیمانده امروز: ${faNum(remainingToday)} گرم`,
      );
      return;
    }
    const remainingMonth = sideInfo?.remainingThisMonthGrams;
    if (remainingMonth != null && grams > Number(remainingMonth)) {
      setFormError(
        `سقف ${isBuy ? "خرید" : "فروش"} ماهانه ${faNum(sideInfo?.monthlyLimitGrams)} گرم است. باقیمانده این ماه: ${faNum(remainingMonth)} گرم`,
      );
      return;
    }

    if (isBuy) {
      // برآورد با کارمزد؛ مبلغ دقیق در پیش‌فاکتور مشخص و دوباره بررسی می‌شود
      if (wallet && estimate && wallet.availableRial < estimate.net * 10) {
        setFormError(
          `موجودی قابل استفاده کافی نیست. برآورد مبلغ لازم: ${Math.ceil(estimate.net).toLocaleString("fa-IR")} تومان`,
        );
        return;
      }
    } else if (wallet && availableGrams < grams) {
      setFormError(
        `موجودی طلای قابل استفاده کافی نیست. موجودی: ${faNum(availableGrams)} گرم`,
      );
      return;
    }

    setIsModalOpen(true);
  };

  // فروش کل موجودی آزاد (گرد به پایین تا ۴ رقم اعشار)
  const handleSellAll = () => {
    const all = Math.floor(availableGrams * 10_000) / 10_000;
    if (all <= 0) {
      setFormError("موجودی طلای قابل فروش ندارید.");
      return;
    }
    handleWeightChange(all.toFixed(4));
    setInputMode("gram");
    setFormError(null);
  };

  return (
    <div
      className="w-full max-w-5xl mx-auto space-y-5 animate-in fade-in duration-500"
      dir="rtl"
    >
      {/* ── هدر صفحه ── */}
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard"
          className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors shadow-sm shrink-0"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-[20px] font-black text-gray-800">
            خرید و فروش طلای آبشده
          </h1>
          <p className="text-[12px] text-gray-500 mt-0.5">
            معامله لحظه‌ای با قیمت زنده بازار
          </p>
        </div>
        <button
          onClick={() => refreshPrice()}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-700 border border-gray-200 bg-white transition-colors"
          title="بروزرسانی قیمت"
        >
          <RefreshCw
            className={`w-4 h-4 ${priceLoading ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ══ ستون اصلی ══ */}
        <div className="lg:col-span-8 space-y-4">
          {/* ── کارت قیمت لحظه‌ای با نمودار مینی ── */}
          <div
            className="relative overflow-hidden rounded-2xl p-5"
            style={{
              background:
                "linear-gradient(135deg, var(--color-emerald) 0%, #24060a 55%, #12030a 100%)",
              border: "1px solid rgba(197,160,89,.25)",
              boxShadow: "0 10px 30px rgba(51,5,9,.25)",
            }}
          >
            {/* هاله نوری */}
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10 blur-2xl bg-gold-500 pointer-events-none" />
            <div className="absolute -bottom-14 -left-14 w-40 h-40 rounded-full opacity-[0.06] blur-2xl bg-gold-500 pointer-events-none" />

            <div className="relative z-10 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  <span className="text-[11px] text-white/60 font-medium">
                    قیمت زنده طلای آبشده ۱۸ عیار
                  </span>
                </div>

                {priceLoading ? (
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                    <span className="text-white/60 text-[14px]">
                      در حال دریافت...
                    </span>
                  </div>
                ) : (
                  <p className="text-[28px] font-black text-white leading-none">
                    {currentPriceToman
                      ? currentPriceToman.toLocaleString("fa-IR")
                      : "—"}
                    <span className="text-[14px] font-bold text-white/60 mr-1.5">
                      تومان/گرم
                    </span>
                  </p>
                )}

                {marketPriceData && (
                  <div
                    className={`inline-flex items-center gap-1 mt-2 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                      change24h >= 0
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {change24h >= 0 ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {change24h >= 0 ? "+" : ""}
                    {faNum(change24h, 2)}٪ امروز
                  </div>
                )}
              </div>

              {/* نمودار ۲۴ ساعته مینی */}
              {history.length > 1 && (
                <div className="w-28 opacity-70">
                  <MiniChart data={history} />
                  <p className="text-[9px] text-white/40 text-center mt-1">
                    نمودار ۲۴ ساعت
                  </p>
                </div>
              )}
            </div>

            {/* زمان بروزرسانی */}
            {marketPriceData && (
              <div className="relative z-10 flex items-center gap-1.5 mt-3 pt-3 border-t border-white/10">
                <Clock className="w-3 h-3 text-white/30" />
                <span className="text-[10px] text-white/30">
                  آخرین بروزرسانی:{" "}
                  {new Date(marketPriceData.fetchedAt).toLocaleTimeString(
                    "fa-IR",
                  )}
                </span>
              </div>
            )}
          </div>

          {/* ── موجودی کیف پول: نسخه کارتی موبایل (فقط موبایل، کنار قیمت زنده) ── */}
          <div className="grid grid-cols-2 gap-3 lg:hidden">
            <div
              className="rounded-2xl p-3.5 flex flex-col gap-1.5 shadow-sm"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex items-center gap-1.5 text-gray-400">
                <Wallet className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">موجودی نقدی</span>
              </div>
              <p className="text-[15px] font-black text-gray-800 leading-none">
                {walletLoading ? "..." : rT(wallet?.availableRial ?? 0)}
                <span className="text-[9px] font-bold text-gray-400 mr-1">
                  ت
                </span>
              </p>
            </div>
            <div
              className="rounded-2xl p-3.5 flex flex-col gap-1.5 border shadow-sm"
              style={{
                backgroundColor: "rgba(197,160,89,.08)",
                borderColor: "rgba(197,160,89,.3)",
              }}
            >
              <div
                className="flex items-center gap-1.5"
                style={{ color: "var(--color-gold-600)" }}
              >
                <Coins className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold">موجودی طلا</span>
              </div>
              <p
                className="text-[15px] font-black leading-none"
                style={{ color: "var(--color-gold-600)" }}
              >
                {walletLoading
                  ? "..."
                  : (wallet?.availableGrams.toFixed(3) ?? "0.000")}
                <span className="text-[9px] font-bold text-gray-400 mr-1">
                  گرم
                </span>
              </p>
            </div>
          </div>

          {/* ── فرم معامله ── */}
          <div
            className="rounded-2xl overflow-hidden shadow-sm"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            {/* تب‌های خرید/فروش */}
            <div className="flex bg-gray-50 p-1.5 m-4 rounded-xl border border-gray-100">
              <button
                onClick={() => {
                  setTradeType("BUY");
                  setFormError(null);
                  reset();
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[10px] text-[14px] font-bold transition-all duration-300 ${
                  isBuy
                    ? "bg-white shadow-sm text-emerald-700"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" />
                خرید طلا
              </button>
              <button
                onClick={() => {
                  setTradeType("SELL");
                  setFormError(null);
                  reset();
                }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[10px] text-[14px] font-bold transition-all duration-300 ${
                  !isBuy
                    ? "bg-white shadow-sm text-rose-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <ArrowUpCircle className="w-4 h-4" />
                فروش طلا
              </button>
            </div>

            <div className="px-4 pb-5 space-y-4">
              {/* انتخاب حالت ورودی */}
              <div className="flex gap-2">
                <button
                  onClick={() => setInputMode("gram")}
                  className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                    inputMode === "gram"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"
                  }`}
                >
                  ورود گرم
                </button>
                <button
                  onClick={() => setInputMode("toman")}
                  className={`flex-1 py-2 rounded-xl text-[12px] font-bold border transition-all ${
                    inputMode === "toman"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"
                  }`}
                >
                  ورود تومان
                </button>
              </div>

              {/* ── ورودی اول ── */}
              {inputMode === "gram" ? (
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-gray-500 flex justify-between">
                    <span>وزن طلا (گرم)</span>
                    <span className="text-gray-400 font-normal">عیار ۱۸</span>
                  </label>
                  <div className="relative">
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-gray-100 rounded-md text-[10px] font-bold text-gray-500">
                      gr
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      placeholder="0.000"
                      value={weightGrams}
                      onChange={(e) => {
                        handleWeightChange(e.target.value);
                        setFormError(null);
                      }}
                      className="w-full bg-gray-50 border-2 border-gray-100 hover:border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 rounded-xl py-4 pr-12 pl-4 text-left text-[20px] font-black text-gray-800 transition-all outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-gray-500 flex justify-between">
                    <span>مبلغ {isBuy ? "پرداختی" : "دریافتی"} (تومان)</span>
                    <span className="text-gray-400 font-normal">تقریبی</span>
                  </label>
                  <div className="relative">
                    <Banknote className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="0"
                      value={
                        amountToman
                          ? Number(amountToman).toLocaleString("fa-IR")
                          : ""
                      }
                      onChange={(e) => {
                        // مقدار خام (شامل ارقام فارسی/انگلیسی) مستقیم به هوک پاس داده می‌شود
                        // تا خودش تبدیل و نرمال‌سازی را انجام دهد - پیش‌فیلتر نکردن اینجا
                        // باعث می‌شد فقط آخرین رقم تایپ‌شده باقی بماند.
                        handleAmountChange(e.target.value);
                        setFormError(null);
                      }}
                      className="w-full bg-gray-50 border-2 border-gray-100 hover:border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 rounded-xl py-4 pr-12 pl-4 text-left text-[20px] font-black text-gray-800 transition-all outline-none"
                    />
                  </div>
                </div>
              )}

              {/* آیکون تبدیل */}
              <div className="flex justify-center -my-1 relative z-10">
                <div className="bg-gray-100 border-2 border-white rounded-full p-1.5 text-gray-400 shadow-sm">
                  <Scale className="w-4 h-4" />
                </div>
              </div>

              {/* ── ورودی دوم (معادل) ── */}
              {inputMode === "gram" ? (
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-gray-500 flex justify-between">
                    <span>مبلغ {isBuy ? "پرداختی" : "دریافتی"} (تومان)</span>
                    <span className="text-[11px] text-gray-400">
                      تقریبی — کارمزد جدا محاسبه می‌شود
                    </span>
                  </label>
                  <div className="relative">
                    <Banknote className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                    <input
                      type="text"
                      inputMode="numeric"
                      dir="ltr"
                      placeholder="0"
                      value={
                        amountToman
                          ? Number(amountToman).toLocaleString("fa-IR")
                          : ""
                      }
                      onChange={(e) => {
                        handleAmountChange(e.target.value);
                        setInputMode("toman");
                        setFormError(null);
                      }}
                      className="w-full bg-gray-50/50 border-2 border-dashed border-gray-100 rounded-xl py-4 pr-12 pl-4 text-left text-[18px] font-bold text-gray-500 transition-all outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-[12px] font-bold text-gray-500">
                    وزن طلا (گرم)
                  </label>
                  <div className="relative">
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center bg-gray-100/50 rounded-md text-[10px] font-bold text-gray-400">
                      gr
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      dir="ltr"
                      placeholder="0.0000"
                      value={weightGrams}
                      onChange={(e) => {
                        handleWeightChange(e.target.value);
                        setInputMode("gram");
                        setFormError(null);
                      }}
                      className="w-full bg-gray-50/50 border-2 border-dashed border-gray-100 rounded-xl py-4 pr-12 pl-4 text-left text-[18px] font-bold text-gray-500 transition-all outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10"
                    />
                  </div>
                </div>
              )}

              {/* ── مقادیر پیشنهادی ── */}
              <div className="space-y-1.5">
                <p className="text-[11px] text-gray-400 font-medium">
                  مقادیر پیشنهادی
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {isBuy
                    ? BUY_QUICK.map((v) => (
                        <button
                          key={v}
                          onClick={() => {
                            handleWeightChange(String(v));
                            setInputMode("gram");
                            setFormError(null);
                          }}
                          className="py-2 rounded-xl text-[12px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                        >
                          {v} گ
                        </button>
                      ))
                    : SELL_QUICK_TOMAN.map((v) => (
                        <button
                          key={v}
                          onClick={() => {
                            handleAmountChange(String(v));
                            setInputMode("toman");
                            setFormError(null);
                          }}
                          className="py-2 rounded-xl text-[11px] font-bold border border-gray-200 bg-gray-50 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-700 transition-all"
                        >
                          {v >= 1_000_000
                            ? `${v / 1_000_000}م`
                            : `${v / 1_000}ه`}
                        </button>
                      ))}
                </div>
                {!isBuy && (
                  <button
                    onClick={handleSellAll}
                    disabled={walletLoading || availableGrams <= 0}
                    className="w-full py-2 rounded-xl text-[12px] font-bold border border-dashed border-rose-300 text-rose-600 hover:bg-rose-50 transition-all disabled:opacity-40"
                  >
                    فروش کل موجودی ({faNum(availableGrams)} گرم)
                  </button>
                )}
              </div>

              {/* ── برآورد مبلغ نهایی ── */}
              {estimate && (
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-3.5 py-3 space-y-1.5 text-[12px]">
                  <div className="flex justify-between text-gray-500">
                    <span>
                      کارمزد{taxPercent > 0 ? " و مالیات" : ""} (
                      {faNum(feePercent + taxPercent, 2)}٪)
                    </span>
                    <span className="tabular-nums">
                      {Math.round(estimate.charges).toLocaleString("fa-IR")}{" "}
                      تومان
                    </span>
                  </div>
                  <div className="flex justify-between font-black text-gray-800">
                    <span>
                      برآورد مبلغ {isBuy ? "پرداختی" : "دریافتی"} نهایی
                    </span>
                    <span className="tabular-nums">
                      {Math.round(estimate.net).toLocaleString("fa-IR")} تومان
                    </span>
                  </div>
                  {sideInfo?.remainingTodayGrams != null && (
                    <div className="flex justify-between text-[11px] text-gray-400">
                      <span>باقیمانده سقف {isBuy ? "خرید" : "فروش"} امروز</span>
                      <span className="tabular-nums">
                        {faNum(sideInfo.remainingTodayGrams)} گرم
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── توقف معامله ── */}
              {blockedReason && !formError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-[12px] font-bold">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {blockedReason}
                </div>
              )}

              {/* ── خطای فرم ── */}
              {formError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold animate-in fade-in">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}

              {/* ── دکمه اصلی ── */}
              <button
                onClick={handleOpenModal}
                disabled={
                  !weightGrams ||
                  grams <= 0 ||
                  priceLoading ||
                  !currentPriceToman ||
                  !!blockedReason
                }
                className="w-full py-4 rounded-xl text-[15px] font-black text-white transition-all active:scale-[0.98] shadow-lg disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{
                  background: isBuy
                    ? "linear-gradient(135deg, var(--color-emerald), #4a0d13)"
                    : "linear-gradient(135deg, #dc2626, #8f1d1d)",
                  boxShadow: isBuy
                    ? "0 8px 20px rgba(51,5,9,.3)"
                    : "0 8px 20px rgba(220,38,38,.3)",
                }}
              >
                {priceLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isBuy ? (
                  <>
                    <ArrowDownCircle className="w-5 h-5" />
                    درخواست خرید و قفل قیمت
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="w-5 h-5" />
                    درخواست فروش و قفل قیمت
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ══ ستون کناری (فقط دسکتاپ برای موجودی) ══ */}
        <div className="lg:col-span-4 space-y-4">
          {/* کارت موجودی - فقط دسکتاپ (در موبایل نسخه کارتی بالای صفحه نمایش داده می‌شود) */}
          <div
            className="hidden lg:block rounded-2xl p-5 shadow-sm"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <Wallet
                className="w-4 h-4"
                style={{ color: "var(--color-gold-500)" }}
              />
              <h3 className="text-[14px] font-black text-gray-800">
                موجودی کیف پول
              </h3>
              {walletLoading && (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 mr-auto" />
              )}
            </div>

            <div className="space-y-3">
              <div
                className="rounded-xl p-3.5 flex justify-between items-center"
                style={{ backgroundColor: "var(--color-bg-page)" }}
              >
                <span className="text-[12px] font-bold text-gray-500">
                  موجودی نقدی
                </span>
                <div className="text-left">
                  <span className="text-[15px] font-black text-gray-800">
                    {walletLoading ? "..." : rT(wallet?.availableRial ?? 0)}
                  </span>
                  <span className="text-[10px] text-gray-400 mr-1">تومان</span>
                </div>
              </div>

              <div
                className="rounded-xl p-3.5 flex justify-between items-center border"
                style={{
                  backgroundColor: "rgba(197,160,89,.06)",
                  borderColor: "rgba(197,160,89,.25)",
                }}
              >
                <span
                  className="text-[12px] font-bold"
                  style={{ color: "var(--color-gold-600)" }}
                >
                  موجودی طلا
                </span>
                <div className="text-left">
                  <span
                    className="text-[15px] font-black"
                    style={{ color: "var(--color-gold-600)" }}
                  >
                    {walletLoading
                      ? "..."
                      : (wallet?.availableGrams.toFixed(4) ?? "0.0000")}
                  </span>
                  <span className="text-[10px] text-gray-400 mr-1">گرم</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <Link
                href="/dashboard/wallet/deposit"
                className="block w-full text-center py-2.5 rounded-xl text-[12px] font-bold transition-colors hover:opacity-80"
                style={{
                  backgroundColor: "var(--color-emerald-light)",
                  color: "var(--color-emerald)",
                }}
              >
                + افزایش موجودی
              </Link>
            </div>
          </div>

          {/* دکمه افزایش موجودی سریع - فقط موبایل */}
          <Link
            href="/dashboard/wallet/deposit"
            className="lg:hidden block w-full text-center py-3 rounded-xl text-[12px] font-bold transition-colors"
            style={{
              backgroundColor: "var(--color-emerald-light)",
              color: "var(--color-emerald)",
            }}
          >
            + افزایش موجودی کیف پول
          </Link>

          {/* راهنما و قوانین */}
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <Info className="w-4 h-4 text-gray-400" />
              <p className="text-[12px] font-black text-gray-600">
                راهنمای معامله
              </p>
            </div>
            <div className="space-y-2.5 text-[11px] leading-relaxed font-medium text-gray-500">
              <p>
                • قیمت هر ۳۰ ثانیه از بازار واقعی دریافت می‌شود. هنگام ثبت
                سفارش، قیمت به مدت{" "}
                {faNum(
                  Math.round((tradeInfo?.lockDurationSeconds ?? 120) / 60),
                  1,
                )}{" "}
                دقیقه قفل می‌گردد.
              </p>
              {spreadPercent > 0 && (
                <p>
                  • قیمت قفل‌شده شامل اسپرد معاملاتی ({faNum(spreadPercent, 2)}٪
                  خرید بالاتر / فروش پایین‌تر) است؛ بنابراین کمی با قیمت لحظه‌ای
                  بالای صفحه تفاوت دارد.
                </p>
              )}
              <p>
                • کارمزد خرید {faNum(tradeInfo?.buy.feePercent ?? 1, 2)}٪ و
                کارمزد فروش {faNum(tradeInfo?.sell.feePercent ?? 1, 2)}٪ از ارزش
                معامله است و جداگانه محاسبه می‌شود.
              </p>
              <p>
                • برای خرید، کیف پول ریالی خود را ابتدا شارژ کنید. برای فروش،
                طلا در صندوق امانات شما باید موجود باشد. موجودی بلوکه‌شده
                (برداشت یا تحویل فیزیکی در جریان) قابل معامله نیست.
              </p>
              <p>
                • حداقل مقدار معامله <strong>{faNum(minGrams)} گرم</strong>
                {Number(tradeInfo?.buy.dailyLimitGrams ?? 0) > 0 && (
                  <>
                    {" "}
                    و سقف خرید روزانه{" "}
                    <strong>{faNum(tradeInfo?.buy.dailyLimitGrams)} گرم</strong>
                  </>
                )}
                {Number(tradeInfo?.sell.dailyLimitGrams ?? 0) > 0 && (
                  <>
                    {" "}
                    و سقف فروش روزانه{" "}
                    <strong>
                      {faNum(tradeInfo?.sell.dailyLimitGrams)} گرم
                    </strong>
                  </>
                )}{" "}
                است.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── مودال معامله ── */}
      <TradeModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tradeType={tradeType}
        requestedWeightGrams={parseFloat(weightGrams) || 0}
        onSuccess={() => {
          reset();
          setFormError(null);
          refreshTradeInfo();
        }}
      />
    </div>
  );
}
