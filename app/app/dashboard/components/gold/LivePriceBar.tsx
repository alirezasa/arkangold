"use client";

import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

interface LivePriceBarProps {
  /** قیمت هر گرم به تومان */
  priceToman: number;
  loading?: boolean;
  error?: string | null;
  /** زمان آخرین دریافت قیمت */
  fetchedAt?: string | null;
  fromCache?: boolean;
  /** درصد تغییر؛ null یعنی نمایش داده نشود */
  changePercent?: number | null;
  /** توضیح بازه‌ی تغییر (مثلاً «۲۴ ساعت») */
  changeLabel?: string;
  title?: string;
  onRefresh?: () => void;
}

/**
 * نوار قیمت لحظه‌ای طلا — هم‌رنگ برند (زمینه‌ی زرشکی تیره و قیمت طلایی)
 * و ریسپانسیو از موبایل‌های کوچک تا دسکتاپ.
 */
export default function LivePriceBar({
  priceToman,
  loading = false,
  error = null,
  fetchedAt,
  fromCache,
  changePercent = null,
  changeLabel,
  title = "قیمت لحظه‌ای طلا (۱۸ عیار)",
  onRefresh,
}: LivePriceBarProps) {
  const hasPrice = priceToman > 0;
  const showChange =
    !loading && changePercent !== null && Number.isFinite(changePercent);
  const isUp = (changePercent ?? 0) >= 0;

  return (
    <section
      className="relative overflow-hidden rounded-2xl sm:rounded-3xl p-4 sm:p-5"
      style={{
        background:
          "linear-gradient(135deg, var(--color-emerald) 0%, #24060a 55%, #12030a 100%)",
        border: "1px solid rgba(197,160,89,.28)",
        boxShadow: "0 10px 30px rgba(51,5,9,.22)",
      }}
      aria-live="polite"
    >
      {/* هاله‌ی نوری */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gold-500 opacity-10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-gold-500 opacity-[0.06] blur-2xl" />

      <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* قیمت */}
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full sm:h-12 sm:w-12"
            style={{
              background: "rgba(197,160,89,.14)",
              border: "1px solid rgba(197,160,89,.35)",
            }}
          >
            <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-red-500 opacity-70" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>

          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[12px] font-bold text-white/70 sm:text-[13px]">
              {title}
            </span>

            {loading && !hasPrice ? (
              <span className="mt-1.5 h-6 w-40 max-w-full animate-pulse rounded-lg bg-white/15 sm:h-7 sm:w-52" />
            ) : (
              <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 leading-tight">
                <span
                  className="whitespace-nowrap text-[22px] font-black tracking-tight tabular-nums sm:text-[26px] lg:text-[28px]"
                  style={{ color: "var(--color-gold-500)" }}
                >
                  {hasPrice ? priceToman.toLocaleString("fa-IR") : "—"}
                </span>
                <span className="text-[11px] font-bold text-white/60 sm:text-[12px]">
                  تومان / گرم
                </span>
              </span>
            )}

            {error && !hasPrice ? (
              <span className="mt-0.5 text-[10px] font-medium text-red-300 sm:text-[11px]">
                {error}
              </span>
            ) : (
              fetchedAt && (
                <span className="mt-0.5 truncate text-[10px] font-medium text-white/45 sm:text-[11px]">
                  {fromCache ? "از کش" : "زنده"} · بروزرسانی:{" "}
                  {new Date(fetchedAt).toLocaleTimeString("fa-IR")}
                </span>
              )
            )}
          </div>
        </div>

        {/* تغییرات + بروزرسانی */}
        <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-3 sm:justify-end sm:border-0 sm:pt-0">
          {showChange ? (
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-black sm:px-3 sm:text-[13px] ${
                  isUp
                    ? "border-emerald-400/30 bg-emerald-400/15 text-emerald-300"
                    : "border-red-400/30 bg-red-400/15 text-red-300"
                }`}
                dir="ltr"
              >
                {isUp ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {isUp ? "+" : ""}
                {(changePercent ?? 0).toFixed(2)}٪
              </span>
              {changeLabel && (
                <span className="whitespace-nowrap text-[10px] font-medium text-white/45 sm:text-[11px]">
                  {changeLabel}
                </span>
              )}
            </div>
          ) : (
            <span />
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
              aria-label="بروزرسانی قیمت"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
