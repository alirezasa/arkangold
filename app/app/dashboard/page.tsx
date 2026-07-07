"use client";

import Link from "next/link";
import { useMarketPrice, usePriceHistory } from "@/app/hooks/useTrading";
import {
  useTransactions,
  useTransactionsSummary,
} from "@/app/hooks/useTransactions";
import { useWallet } from "@/app/hooks/useWallet";
import type { TransactionItem } from "@/app/hooks/useTransactions";
import {
  TrendingUp,
  TrendingDown,
  Flame,
  GripHorizontal,
  Gem,
  ChevronLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet as WalletIcon,
  Percent,
  Package,
  Gift,
  RefreshCw,
  Loader2,
  Coins,
} from "lucide-react";
import { rialToToman, rialToTomanNum } from "./wallet/_helpers";

// ─── نگاشت دسته‌بندی تراکنش به آیکون/رنگ ───
const CATEGORY_STYLE: Record<
  string,
  { bg: string; color: string; icon: React.ElementType }
> = {
  buy: { bg: "#dcfce7", color: "#16a34a", icon: ArrowDownCircle },
  sell: { bg: "#fee2e2", color: "#dc2626", icon: ArrowUpCircle },
  deposit: { bg: "#dbeafe", color: "#2563eb", icon: WalletIcon },
  withdrawal: { bg: "#fef3c7", color: "#b45309", icon: WalletIcon },
  fee: { bg: "#f3e8ff", color: "#9333ea", icon: Percent },
  shop: { bg: "#ffe4e6", color: "#e11d48", icon: Package },
  physical: { bg: "#fef9c3", color: "#a16207", icon: Package },
  other: { bg: "#f1f5f9", color: "#64748b", icon: Gift },
};

function TxIcon({ category }: { category: string }) {
  const s = CATEGORY_STYLE[category] ?? CATEGORY_STYLE.other;
  const Icon = s.icon;
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      <Icon className="w-4.5 h-4.5" />
    </div>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function txAmountLabel(tx: TransactionItem) {
  if (tx.amountGrams) {
    return `${tx.sign === "plus" ? "+" : "-"}${Number(tx.amountGrams).toLocaleString("fa-IR")} گ`;
  }
  if (tx.amountToman) {
    return `${tx.sign === "plus" ? "+" : "-"}${Number(tx.amountToman).toLocaleString("fa-IR")} ت`;
  }
  return "—";
}

// ─── نمودار قیمت ۲۴ ساعته (دیتای واقعی از price_history) ───
function PriceHistoryChart({
  data,
}: {
  data: { time: string; priceToman: string | number }[];
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-36 text-[12px] text-gray-400 font-medium">
        دیتای کافی برای نمودار وجود ندارد
      </div>
    );
  }

  const prices = data.map((d) => Number(d.priceToman));
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const W = 640;
  const H = 160;

  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - ((p - min) / range) * (H - 10) - 5;
    return { x, y };
  });

  const linePoints = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPoints = `0,${H} ${linePoints} ${W},${H}`;
  const isPositive = prices[prices.length - 1] >= prices[0];
  const strokeColor = isPositive ? "#16a34a" : "#dc2626";

  return (
    <div dir="ltr" className="w-full">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-36"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#priceGradient)" />
        <polyline
          points={linePoints}
          fill="none"
          stroke={strokeColor}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400 font-medium">
        <span>کمترین: {min.toLocaleString("fa-IR")} ت</span>
        <span>بیشترین: {max.toLocaleString("fa-IR")} ت</span>
      </div>
    </div>
  );
}

// ─── صفحه اصلی داشبورد ───
export default function DashboardPage() {
  // قیمت لحظه‌ای — از کش (Redis) از طریق /api/market/price که به PriceService وصل است
  const {
    price: marketPrice,
    loading: priceLoading,
    refresh: refreshPrice,
  } = useMarketPrice();
  const { history } = usePriceHistory(24);
  const { wallet, loading: walletLoading } = useWallet();
  const { transactions, loading: txLoading } = useTransactions(1, "ALL");
  const { summary } = useTransactionsSummary();

  const currentPriceToman = marketPrice?.pricePerGramToman
    ? Number(marketPrice.pricePerGramToman)
    : 0;

  // change24h از خودِ پاسخ کش (اگر موجود بود) در غیر این‌صورت از تاریخچه محاسبه می‌شود
  const rawCachedChange = (marketPrice as unknown as { change24h?: unknown })
    ?.change24h;
  const cachedChange =
    typeof rawCachedChange === "number"
      ? rawCachedChange
      : typeof rawCachedChange === "string"
        ? parseFloat(rawCachedChange)
        : NaN;

  const historyChange =
    history.length > 1 && Number(history[0].priceToman) !== 0
      ? ((Number(history[history.length - 1].priceToman) -
          Number(history[0].priceToman)) /
          Number(history[0].priceToman)) *
        100
      : 0;

  const change24hRaw = Number.isFinite(cachedChange)
    ? cachedChange
    : historyChange;
  const change24h = Number.isFinite(change24hRaw) ? change24hRaw : 0;
  const change24hLabel = change24h.toFixed(2);
  const isPositiveChange = change24h >= 0;

  const goldValueToman = wallet
    ? wallet.goldBalanceGrams * currentPriceToman
    : 0;
  const totalAssetToman = wallet ? wallet.rialBalance / 10 + goldValueToman : 0;

  // ─── بنرهای خدمات اصلی ───
  const services = [
    {
      title: "طلای آبشده",
      subtitle: "خرید و فروش لحظه‌ای",
      href: "/dashboard/melted-gold",
      icon: Flame,
    },
    {
      title: "شمش طلا",
      subtitle: "سرمایه‌گذاری امن",
      href: "/dashboard/gold-ingot",
      icon: GripHorizontal,
    },
    {
      title: "زیورآلات",
      subtitle: "ویترین آنلاین",
      href: "/dashboard/jewelry",
      icon: Gem,
    },
  ];

  return (
    <div
      className="w-full max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700"
      dir="rtl"
    >
      {/* ── ۱. نوار قیمت لحظه‌ای طلا (واقعی، از کش) ── */}
      <div className="rounded-3xl p-1 shadow-[0_8px_30px_rgba(251,191,36,0.15)] bg-white border border-amber-100 flex items-center justify-between">
        <div className="flex items-center gap-4 bg-linear-to-r from-amber-400 via-amber-300 to-yellow-400 rounded-[20px] px-5 py-4 w-full relative overflow-hidden">
          <div className="absolute inset-0 bg-white/10 opacity-50 mix-blend-overlay pointer-events-none" />
          <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-32 h-32 bg-white/20 blur-2xl rounded-full" />

          <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-md shadow-inner flex items-center justify-center shrink-0 relative z-10 border border-white/40">
            <span className="live-dot absolute w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75" />
            <span className="relative w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>

          <div className="flex flex-col relative z-10">
            <span className="text-[13px] font-bold text-amber-900/80 drop-shadow-sm">
              قیمت لحظه‌ای طلا (۱۸ عیار)
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[18px] sm:text-[22px] font-black text-amber-950 drop-shadow-sm tracking-tight">
                {priceLoading
                  ? "درحال دریافت..."
                  : currentPriceToman.toLocaleString("fa-IR")}
                <span className="text-[12px] text-amber-900/80 mr-1.5 font-bold">
                  تومان
                </span>
              </span>
            </div>
            {marketPrice && (
              <span className="text-[10px] text-amber-900/50 font-medium mt-0.5">
                {marketPrice.fromCache ? "از کش" : "زنده"} · بروزرسانی:{" "}
                {new Date(marketPrice.fetchedAt).toLocaleTimeString("fa-IR")}
              </span>
            )}
          </div>

          {!priceLoading && marketPrice && (
            <div
              className={`mr-auto relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-black backdrop-blur-md shadow-sm border ${
                isPositiveChange
                  ? "bg-emerald-500/20 text-emerald-900 border-emerald-500/30"
                  : "bg-red-500/20 text-red-900 border-red-500/30"
              }`}
              dir="ltr"
            >
              {isPositiveChange ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {isPositiveChange ? "+" : ""}
              {change24hLabel}٪
            </div>
          )}

          <button
            onClick={() => refreshPrice()}
            className="relative z-10 mr-2 w-9 h-9 rounded-xl flex items-center justify-center text-amber-900/60 hover:text-amber-900 hover:bg-white/20 transition-colors"
            aria-label="بروزرسانی قیمت"
          >
            <RefreshCw
              className={`w-4 h-4 ${priceLoading ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* ── ۲. کارت‌های آماری کیف پول (دیتای واقعی) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "موجودی طلا",
            value: walletLoading
              ? "..."
              : (wallet?.goldBalanceGrams.toFixed(4) ?? "0.0000"),
            unit: "گرم",
            icon: Coins,
            bg: "bg-amber-50",
            color: "text-amber-600",
          },
          {
            label: "ارزش کل دارایی",
            value: walletLoading ? "..." : rialToTomanNum(totalAssetToman * 10),
            unit: "تومان",
            icon: TrendingUp,
            bg: "bg-emerald-50",
            color: "text-emerald-600",
          },
          {
            label: "خرید امروز",
            value: summary ? summary.todayBuyGoldGrams.toFixed(3) : "...",
            unit: "گرم",
            icon: ArrowDownCircle,
            bg: "bg-green-50",
            color: "text-green-600",
          },
          {
            label: "فروش امروز",
            value: summary ? summary.todaySellGoldGrams.toFixed(3) : "...",
            unit: "گرم",
            icon: ArrowUpCircle,
            bg: "bg-red-50",
            color: "text-red-500",
          },
        ].map((s, i) => (
          <div
            key={i}
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col gap-2"
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${s.bg} ${s.color}`}
            >
              <s.icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-gray-400 font-medium">{s.label}</p>
              <p className="text-[15px] font-black text-gray-800 mt-0.5">
                {s.value}
                <span className="text-[10px] font-bold text-gray-400 mr-1">
                  {s.unit}
                </span>
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── ۳. بنرهای خدمات اصلی (باگ کلاس‌های تیلویند رفع شد) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
        {services.map((service, idx) => {
          const isHeroCard = idx === 0;
          return (
            <Link
              key={idx}
              href={service.href}
              className={`relative group overflow-hidden rounded-[28px] md:rounded-[32px] p-5 md:p-6 transition-all duration-500 border border-gold-500/20 hover:border-gold-500/60 bg-linear-to-br from-emerald to-[#1a0204] shadow-lg hover:shadow-[0_12px_40px_rgba(197,160,89,0.2)] flex flex-col justify-between
                ${isHeroCard ? "col-span-2 md:col-span-1 min-h-35 md:min-h-55" : "col-span-1 aspect-square md:aspect-auto md:min-h-55"}
              `}
            >
              <service.icon className="absolute -left-6 -bottom-6 w-32 h-32 text-gold-500 opacity-5 group-hover:opacity-10 transition-all duration-700 transform group-hover:scale-110 group-hover:-rotate-12 pointer-events-none" />

              <div className="flex justify-between items-start w-full z-10">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-linear-to-br from-[#e6c887] via-gold-500 to-[#8c703b] flex items-center justify-center shrink-0 shadow-[0_4px_15px_rgba(197,160,89,0.4)] text-emerald">
                  <service.icon
                    className="w-6 h-6 md:w-7 md:h-7"
                    strokeWidth={2}
                  />
                </div>

                {isHeroCard && (
                  <div className="w-8 h-8 rounded-full bg-white/5 backdrop-blur-md flex items-center justify-center text-gold-500 group-hover:bg-gold-500 group-hover:text-emerald transition-all border border-white/10 shadow-sm">
                    <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                  </div>
                )}
              </div>

              <div className="z-10 flex flex-col mt-auto text-right w-full pt-4">
                <h3 className="font-black text-white text-[15px] sm:text-[16px] md:text-[20px] tracking-tight group-hover:text-[#e6c887] transition-colors drop-shadow-md">
                  {service.title}
                </h3>
                <p className="text-gold-500/80 text-[11px] md:text-[13px] font-medium mt-1">
                  {service.subtitle}
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── ۴. نمودار قیمت واقعی + آخرین تراکنش‌های واقعی ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100/80 dark:border-gray-800/80">
        {/* نمودار ۲۴ ساعته قیمت (دیتای واقعی price_history) */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-[15px] font-black text-gray-800 dark:text-gray-100">
              نمودار قیمت طلا (۲۴ ساعت گذشته)
            </h3>
            <Link
              href="/dashboard/melted-gold"
              className="text-[12px] font-bold text-gold-500 transition-opacity hover:opacity-70"
            >
              معامله طلا ←
            </Link>
          </div>

          {history.length === 0 ? (
            <div className="flex items-center justify-center h-36">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : (
            <PriceHistoryChart data={history} />
          )}
        </div>

        {/* آخرین تراکنش‌ها (دیتای واقعی از /api/transactions) */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-black text-gray-800 dark:text-gray-100">
              آخرین تراکنش‌ها
            </h3>
            <Link
              href="/dashboard/transactions"
              className="text-[12px] font-bold text-[#064e3b] dark:text-emerald-500 transition-opacity hover:opacity-70"
            >
              همه تراکنش‌ها ←
            </Link>
          </div>

          {txLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-8">
              <WalletIcon className="w-8 h-8 text-gray-200" />
              <p className="text-[12px] text-gray-400 font-medium">
                هنوز تراکنشی ثبت نشده است
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 flex-1 justify-center">
              {transactions.slice(0, 4).map((tx) => {
                const { date, time } = formatDateTime(tx.createdAt);
                return (
                  <div
                    key={tx.id}
                    className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent hover:border-gray-100 dark:hover:border-gray-600"
                  >
                    <TxIcon category={tx.category} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-gray-800 dark:text-gray-200 truncate">
                        {tx.title}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-1">
                        {date} · {time}
                      </p>
                    </div>
                    <div className="text-left shrink-0">
                      <p
                        className="text-[14px] font-black"
                        style={{
                          color:
                            tx.sign === "plus"
                              ? "#16a34a"
                              : "var(--color-red, #dc2626)",
                        }}
                      >
                        {txAmountLabel(tx)}
                      </p>
                      {tx.amountToman && tx.amountGrams && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          {Number(tx.amountToman).toLocaleString("fa-IR")} ت
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
