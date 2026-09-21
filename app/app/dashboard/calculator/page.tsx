"use client";

import { useState } from "react";
import Link from "next/link";
import { useMarketPrice } from "@/app/hooks/useTrading";
import { useGoldMgCalculator } from "@/app/hooks/useGoldMgCalculator";
import {
  ChevronRight,
  Calculator,
  ArrowLeftRight,
  Scale,
  Banknote,
  RefreshCw,
  Loader2,
  Clock,
  Info,
} from "lucide-react";

const MG_QUICK = [100, 500, 1000, 5000];
const TOMAN_QUICK = [100_000, 500_000, 1_000_000, 5_000_000];

export default function GoldCalculatorPage() {
  const [activeField, setActiveField] = useState<"mg" | "toman">("mg");

  const {
    price: marketPriceData,
    loading: priceLoading,
    refresh: refreshPrice,
  } = useMarketPrice();

  const currentPriceToman = marketPriceData?.pricePerGramToman
    ? parseFloat(String(marketPriceData.pricePerGramToman))
    : null;

  const {
    weightMg,
    amountToman,
    pricePerMg,
    handleWeightChange,
    handleAmountChange,
    reset,
  } = useGoldMgCalculator(currentPriceToman);

  return (
    <div
      className="w-full max-w-3xl mx-auto space-y-5 pb-24 animate-in fade-in duration-500"
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
            محاسبه‌گر طلا
          </h1>
          <p className="text-[12px] text-gray-500 mt-0.5">
            تبدیل میلی‌گرم به تومان و تومان به میلی‌گرم با قیمت لحظه‌ای
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

      {/* ── کارت قیمت لحظه‌ای ── */}
      <div
        className="relative overflow-hidden rounded-2xl p-5"
        style={{
          background:
            "linear-gradient(135deg, var(--color-emerald) 0%, #24060a 55%, #12030a 100%)",
          border: "1px solid rgba(197,160,89,.25)",
          boxShadow: "0 10px 30px rgba(51,5,9,.25)",
        }}
      >
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10 blur-2xl bg-gold-500 pointer-events-none" />
        <div className="absolute -bottom-14 -left-14 w-40 h-40 rounded-full opacity-[0.06] blur-2xl bg-gold-500 pointer-events-none" />

        <div className="relative z-10">
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
            <div className="flex items-end gap-4 flex-wrap mt-1">
              <p className="text-[26px] font-black text-white leading-none">
                {currentPriceToman
                  ? currentPriceToman.toLocaleString("fa-IR")
                  : "—"}
                <span className="text-[13px] font-bold text-white/60 mr-1.5">
                  تومان / گرم
                </span>
              </p>
              <p className="text-[15px] font-black text-white/90 leading-none">
                {pricePerMg
                  ? pricePerMg.toLocaleString("fa-IR", {
                      maximumFractionDigits: 1,
                    })
                  : "—"}
                <span className="text-[11px] font-bold text-white/50 mr-1.5">
                  تومان / میلی‌گرم
                </span>
              </p>
            </div>
          )}

          {marketPriceData && (
            <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/10">
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
      </div>

      {/* ── فرم محاسبه‌گر ── */}
      <div
        className="rounded-2xl overflow-hidden shadow-sm"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-2 px-4 pt-4">
          <Calculator className="w-4 h-4" style={{ color: "var(--color-gold-600)" }} />
          <h3 className="text-[14px] font-black text-gray-800">
            تبدیل وزن و مبلغ
          </h3>
        </div>

        <div className="px-4 pb-5 pt-3 space-y-4">
          {/* ── ورودی میلی‌گرم ── */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500 flex justify-between">
              <span>وزن طلا (میلی‌گرم)</span>
              <span className="text-gray-400 font-normal">عیار ۱۸</span>
            </label>
            <div className="relative">
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 w-8 h-6 flex items-center justify-center bg-gray-100 rounded-md text-[10px] font-bold text-gray-500">
                mg
              </div>
              <input
                type="text"
                inputMode="decimal"
                dir="ltr"
                placeholder="0"
                value={weightMg}
                onChange={(e) => {
                  handleWeightChange(e.target.value);
                  setActiveField("mg");
                }}
                className="w-full bg-gray-50 border-2 border-gray-100 hover:border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 rounded-xl py-4 pr-14 pl-4 text-left text-[20px] font-black text-gray-800 transition-all outline-none"
              />
            </div>
          </div>

          {/* آیکون تبدیل */}
          <div className="flex justify-center -my-1 relative z-10">
            <div className="bg-gray-100 border-2 border-white rounded-full p-1.5 text-gray-400 shadow-sm">
              <ArrowLeftRight className="w-4 h-4 rotate-90" />
            </div>
          </div>

          {/* ── ورودی تومان ── */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-bold text-gray-500">
              مبلغ معادل (تومان)
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
                  handleAmountChange(e.target.value);
                  setActiveField("toman");
                }}
                className="w-full bg-gray-50 border-2 border-gray-100 hover:border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-400/10 rounded-xl py-4 pr-12 pl-4 text-left text-[20px] font-black text-gray-800 transition-all outline-none"
              />
            </div>
          </div>

          {/* ── مقادیر پیشنهادی ── */}
          <div className="space-y-1.5">
            <p className="text-[11px] text-gray-400 font-medium">
              {activeField === "mg" ? "میلی‌گرم پیشنهادی" : "مبلغ پیشنهادی"}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {activeField === "mg"
                ? MG_QUICK.map((v) => (
                    <button
                      key={v}
                      onClick={() => handleWeightChange(String(v))}
                      className="py-2 rounded-xl text-[12px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                    >
                      {v.toLocaleString("fa-IR")}
                    </button>
                  ))
                : TOMAN_QUICK.map((v) => (
                    <button
                      key={v}
                      onClick={() => handleAmountChange(String(v))}
                      className="py-2 rounded-xl text-[11px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
                    >
                      {v >= 1_000_000 ? `${v / 1_000_000}م` : `${v / 1_000}ه`}
                    </button>
                  ))}
            </div>
          </div>

          {/* ── دکمه پاک‌کردن ── */}
          <button
            onClick={reset}
            className="w-full py-3 rounded-xl text-[13px] font-bold text-gray-500 border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            پاک کردن
          </button>

          {/* ── دکمه‌های اقدام سریع ── */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Link
              href="/dashboard/melted-gold"
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black text-white transition-all active:scale-[0.98] shadow-sm"
              style={{
                background: "linear-gradient(135deg, var(--color-emerald), #4a0d13)",
              }}
            >
              <Scale className="w-4 h-4" />
              خرید طلا
            </Link>
            <Link
              href="/dashboard/chart"
              className="flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-black border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              نمودار قیمت
            </Link>
          </div>
        </div>
      </div>

      {/* ── راهنما ── */}
      <div
        className="rounded-2xl p-4 space-y-2.5"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Info className="w-4 h-4 text-gray-400" />
          <p className="text-[12px] font-black text-gray-600">راهنما</p>
        </div>
        <div className="space-y-2 text-[11px] leading-relaxed font-medium text-gray-500">
          <p>
            • هر ۱۰۰۰ میلی‌گرم برابر با ۱ گرم است. قیمت هر میلی‌گرم از تقسیم
            قیمت لحظه‌ای هر گرم بر ۱۰۰۰ محاسبه می‌شود.
          </p>
          <p>
            • این ابزار صرفاً برای محاسبه تقریبی است؛ قیمت نهایی معامله در زمان
            ثبت سفارش و پس از قفل قیمت مشخص می‌شود.
          </p>
        </div>
      </div>
    </div>
  );
}
