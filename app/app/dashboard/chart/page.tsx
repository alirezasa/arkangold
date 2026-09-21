// app/app/dashboard/chart/page.tsx
"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  useMarketPrice,
  usePriceHistory,
  type PriceHistoryPoint,
} from "@/app/hooks/useTrading";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
} from "lucide-react";

type RangeKey = "24h" | "7d" | "30d" | "90d";

const RANGES: { key: RangeKey; label: string; hours: number }[] = [
  { key: "24h", label: "۲۴ ساعت", hours: 24 },
  { key: "7d", label: "۷ روز", hours: 168 },
  { key: "30d", label: "۱ ماه", hours: 720 },
  { key: "90d", label: "۳ ماه", hours: 2160 },
];

function formatToman(value: number) {
  return Math.round(value).toLocaleString("fa-IR");
}

function formatAxisTime(iso: string, rangeKey: RangeKey) {
  const d = new Date(iso);
  return rangeKey === "24h"
    ? d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
}

// ─── نمودار تعاملی قیمت (خط + هاله + کراسور لمسی/موس) ───
function InteractivePriceChart({
  data,
  rangeKey,
}: {
  data: PriceHistoryPoint[];
  rangeKey: RangeKey;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2">
        <BarChart3 className="w-8 h-8 text-gray-200" />
        <p className="text-[12px] text-gray-400 font-medium">
          دیتای کافی برای نمودار وجود ندارد
        </p>
      </div>
    );
  }

  const prices = data.map((d) => Number(d.priceToman));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 1000;
  const H = 300;
  const PAD = 12;

  const points = prices.map((p, i) => ({
    x: (i / (prices.length - 1)) * W,
    y: H - ((p - min) / range) * (H - PAD * 2) - PAD,
  }));

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`;
  const isPositive = prices[prices.length - 1] >= prices[0];
  const strokeColor = isPositive ? "#16a34a" : "#dc2626";

  const handlePointer = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHoverIndex(Math.round(ratio * (prices.length - 1)));
  };

  const hover =
    hoverIndex !== null
      ? { point: points[hoverIndex], price: prices[hoverIndex], time: data[hoverIndex].time }
      : null;

  return (
    <div dir="ltr" className="w-full select-none">
      <div
        ref={containerRef}
        className="relative w-full h-64 sm:h-72 touch-none"
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setHoverIndex(null)}
        onTouchStart={(e) => handlePointer(e.touches[0].clientX)}
        onTouchMove={(e) => handlePointer(e.touches[0].clientX)}
        onTouchEnd={() => setHoverIndex(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="currentColor"
              className="text-gray-100"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          ))}

          <polygon points={areaPoints} fill="url(#chartGradient)" />
          <polyline
            points={linePoints}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {hover && (
            <>
              <line
                x1={hover.point.x}
                x2={hover.point.x}
                y1="0"
                y2={H}
                stroke={strokeColor}
                strokeWidth="1"
                strokeDasharray="3 3"
                opacity="0.5"
              />
              <circle
                cx={hover.point.x}
                cy={hover.point.y}
                r="5"
                fill="#fff"
                stroke={strokeColor}
                strokeWidth="2.5"
              />
            </>
          )}
        </svg>

        {hover && (
          <div
            className="absolute -translate-x-1/2 -translate-y-full pointer-events-none rounded-xl bg-gray-900 text-white px-3 py-2 text-[11px] font-bold shadow-lg whitespace-nowrap z-10"
            style={{
              left: `${(hover.point.x / W) * 100}%`,
              top: `${Math.max(6, (hover.point.y / H) * 100)}%`,
            }}
          >
            <div dir="rtl">{formatToman(hover.price)} تومان</div>
            <div dir="rtl" className="text-white/60 font-medium mt-0.5">
              {formatAxisTime(hover.time, rangeKey)}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400 font-medium" dir="rtl">
        <span>کمترین: {formatToman(min)} ت</span>
        <span>بیشترین: {formatToman(max)} ت</span>
      </div>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-1">
      <p className="text-[10px] text-gray-400 font-medium">{label}</p>
      <p
        className="text-[15px] font-black"
        style={{
          color:
            tone === "up" ? "#16a34a" : tone === "down" ? "#dc2626" : "#1f2937",
        }}
      >
        {value}
      </p>
    </div>
  );
}

export default function PriceChartPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("24h");
  const activeRange = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];

  const {
    price: marketPrice,
    loading: priceLoading,
    refresh: refreshPrice,
  } = useMarketPrice();
  const { history, loading: historyLoading } = usePriceHistory(activeRange.hours);

  const currentPriceToman = marketPrice?.pricePerGramToman
    ? Number(marketPrice.pricePerGramToman)
    : 0;

  const periodPrices = history.map((h) => Number(h.priceToman));
  const periodHigh = periodPrices.length ? Math.max(...periodPrices) : 0;
  const periodLow = periodPrices.length ? Math.min(...periodPrices) : 0;
  const periodChange =
    periodPrices.length > 1 && periodPrices[0] !== 0
      ? ((periodPrices[periodPrices.length - 1] - periodPrices[0]) / periodPrices[0]) * 100
      : 0;
  const isPositiveChange = periodChange >= 0;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700" dir="rtl">
      {/* ── هدر صفحه ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-black text-gray-800">نمودار قیمت طلا</h1>
          <p className="text-[12px] text-gray-400 font-medium mt-1">
            روند لحظه‌ای و تاریخی قیمت هر گرم طلای آب‌شده
          </p>
        </div>
        <button
          onClick={() => refreshPrice()}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-gray-400 border border-gray-100 hover:text-gold-600 hover:bg-gold-50 transition-colors"
          aria-label="بروزرسانی قیمت"
        >
          <RefreshCw className={`w-4 h-4 ${priceLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── نوار قیمت لحظه‌ای ── */}
      <div className="rounded-3xl p-1 shadow-[0_8px_30px_rgba(251,191,36,0.15)] bg-white border border-amber-100">
        <div className="flex items-center gap-4 bg-linear-to-r from-amber-400 via-amber-300 to-yellow-400 rounded-[20px] px-5 py-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-white/10 opacity-50 mix-blend-overlay pointer-events-none" />
          <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-32 h-32 bg-white/20 blur-2xl rounded-full" />

          <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-md shadow-inner flex items-center justify-center shrink-0 relative z-10 border border-white/40">
            <span className="absolute w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75" />
            <span className="relative w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>

          <div className="flex flex-col relative z-10">
            <span className="text-[13px] font-bold text-amber-900/80">
              قیمت لحظه‌ای طلا (۱۸ عیار)
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[18px] sm:text-[22px] font-black text-amber-950 tracking-tight">
                {priceLoading ? "درحال دریافت..." : currentPriceToman.toLocaleString("fa-IR")}
                <span className="text-[12px] text-amber-900/80 mr-1.5 font-bold">تومان</span>
              </span>
            </div>
            {marketPrice && (
              <span className="text-[10px] text-amber-900/50 font-medium mt-0.5">
                {marketPrice.fromCache ? "از کش" : "زنده"} · بروزرسانی:{" "}
                {new Date(marketPrice.fetchedAt).toLocaleTimeString("fa-IR")}
              </span>
            )}
          </div>

          {!priceLoading && periodPrices.length > 1 && (
            <div
              className={`mr-auto relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-black backdrop-blur-md shadow-sm border ${
                isPositiveChange
                  ? "bg-emerald-500/20 text-emerald-900 border-emerald-500/30"
                  : "bg-red-500/20 text-red-900 border-red-500/30"
              }`}
              dir="ltr"
            >
              {isPositiveChange ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {isPositiveChange ? "+" : ""}
              {periodChange.toFixed(2)}٪
            </div>
          )}
        </div>
      </div>

      {/* ── تب‌های بازه زمانی ── */}
      <div className="flex items-center gap-2 overflow-x-auto">
        {RANGES.map((r) => {
          const active = r.key === rangeKey;
          return (
            <button
              key={r.key}
              onClick={() => setRangeKey(r.key)}
              className={[
                "px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all duration-200 shrink-0",
                active
                  ? "text-white shadow-sm"
                  : "text-gray-400 bg-gray-50 hover:bg-gray-100",
              ].join(" ")}
              style={active ? { backgroundColor: "var(--color-gold-500)" } : undefined}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      {/* ── کارت نمودار ── */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-gray-100">
        {historyLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          </div>
        ) : (
          <InteractivePriceChart data={history} rangeKey={rangeKey} />
        )}
      </div>

      {/* ── آمار بازه انتخابی ── */}
      <div className="grid grid-cols-3 gap-3">
        <StatBox label="کمترین (بازه)" value={`${formatToman(periodLow)} ت`} />
        <StatBox label="بیشترین (بازه)" value={`${formatToman(periodHigh)} ت`} />
        <StatBox
          label="تغییر بازه"
          value={`${isPositiveChange ? "+" : ""}${periodChange.toFixed(2)}٪`}
          tone={isPositiveChange ? "up" : "down"}
        />
      </div>

      {/* ── دکمه‌های اقدام سریع ── */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/trade"
          className="flex items-center justify-center gap-2 rounded-2xl py-3.5 font-black text-[14px] text-white bg-linear-to-r from-emerald-600 to-emerald-700 shadow-sm hover:opacity-90 transition-opacity"
        >
          <ArrowDownCircle className="w-4.5 h-4.5" />
          خرید طلا
        </Link>
        <Link
          href="/dashboard/trade"
          className="flex items-center justify-center gap-2 rounded-2xl py-3.5 font-black text-[14px] text-white bg-linear-to-r from-red-500 to-red-600 shadow-sm hover:opacity-90 transition-opacity"
        >
          <ArrowUpCircle className="w-4.5 h-4.5" />
          فروش طلا
        </Link>
      </div>
    </div>
  );
}
