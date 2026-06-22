"use client";

import Link from "next/link";
import { CHART_DATA, TRANSACTIONS } from "@/app/utils/mock-data";
import type { Transaction } from "@/app/utils/types";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { 
  TrendingUp,
  TrendingDown,
  Flame,
  GripHorizontal,
  Gem,
  ChevronLeft
} from "lucide-react";

// ─── کامپوننت آیکون تراکنش‌ها ───
function TxIcon({ type }: { type: Transaction["type"] }) {
  const map = {
    buy: { bg: "#dcfce7", color: "#16a34a", icon: "ti-arrow-down" },
    sell: { bg: "#fee2e2", color: "#dc2626", icon: "ti-arrow-up" },
    transfer: { bg: "#dbeafe", color: "#2563eb", icon: "ti-transfer" },
  };
  const s = map[type];
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[16px]"
      style={{ background: s.bg, color: s.color }}
    >
      <i className={`ti ${s.icon}`} aria-hidden="true" />
    </div>
  );
}

// ─── صفحه اصلی داشبورد ───
export default function DashboardPage() {
  const { data: goldData, loading: loadingGold } = useGoldPrice();
  const maxBar = Math.max(...CHART_DATA.map((d) => d.value));
  const isPositiveChange = (goldData?.change24h ?? 0) >= 0;

  // ─── اطلاعات بنرهای خدمات اصلی ───
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
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-700" dir="rtl">
      
      {/* ── 1. نوار قیمت لحظه‌ای طلا ── */}
      <div className="rounded-3xl p-1 shadow-[0_8px_30px_rgba(251,191,36,0.15)] bg-white border border-amber-100 flex items-center justify-between">
        <div className="flex items-center gap-4 bg-linear-to-r from-amber-400 via-amber-300 to-yellow-400 rounded-[20px] px-5 py-4 w-full relative overflow-hidden">
          <div className="absolute inset-0 bg-white/10 opacity-50 mix-blend-overlay pointer-events-none" />
          <div className="absolute -left-10 top-1/2 -translate-y-1/2 w-32 h-32 bg-white/20 blur-2xl rounded-full" />
          
          <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-md shadow-inner flex items-center justify-center shrink-0 relative z-10 border border-white/40">
            <span className="live-dot absolute w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75" />
            <span className="relative w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
          </div>
          
          <div className="flex flex-col relative z-10">
            <span className="text-[13px] font-bold text-amber-900/80 drop-shadow-sm">قیمت لحظه ای طلا (۱۸ عیار)</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[18px] sm:text-[22px] font-black text-amber-950 drop-shadow-sm tracking-tight">
                {loadingGold ? "درحال دریافت..." : Number((goldData?.price ?? 0) * 1000).toLocaleString('fa-IR')}
                <span className="text-[12px] text-amber-900/80 mr-1.5 font-bold">تومان</span>
              </span>
            </div>
          </div>
          
          {!loadingGold && goldData && (
            <div className={`mr-auto relative z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[13px] font-black backdrop-blur-md shadow-sm border ${
              isPositiveChange 
                ? "bg-emerald-500/20 text-emerald-900 border-emerald-500/30" 
                : "bg-red-500/20 text-red-900 border-red-500/30"
            }`} dir="ltr">
              {isPositiveChange ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {isPositiveChange ? "+" : ""}{goldData.change24h}٪
            </div>
          )}
        </div>
      </div>

      {/* ── 2. بنرهای خدمات اصلی (طراحی بنتو گرید یکپارچه) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
        {services.map((service, idx) => {
          const isHeroCard = idx === 0;

          return (
            <Link 
              key={idx} 
              href={service.href}
              // ساختار flex-col و justify-between برای همه یکسان شد
              className={`relative group overflow-hidden rounded-3xl:rounded-[32px] p-5 md:p-6 transition-all duration-500 border border-gold-500/20 hover:border-gold-500/60bg-gradient-to-br from-emerald to-[#1a0204] shadow-lg hover:shadow-[0_12px_40px_rgba(197,160,89,0.2)] flex flex-col justify-between
                ${isHeroCard 
                  ? "col-span-2 md:col-span-1 min-h-35 md:min-h-55" 
                  : "col-span-1 aspect-square md:aspect-auto md:min-h-55"
                }
              `}
            >
              {/* افکت واترمارک بزرگ پس‌زمینه */}
              <service.icon className="absolute -left-6 -bottom-6 w-32 h-32 text-gold-500 opacity-5 group-hover:opacity-10 transition-all duration-700 transform group-hover:scale-110 group-hover:-rotate-12 pointer-events-none" />

              {/* بخش بالایی: آیکون + فلش */}
              <div className="flex justify-between items-start w-full z-10">
                <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-linear-to-br from-[#e6c887] via-gold-500 to-[#8c703b] flex items-center justify-center shrink-0 shadow-[0_4px_15px_rgba(197,160,89,0.4)] text-emerald">
                  <service.icon className="w-6 h-6 md:w-7 md:h-7" strokeWidth={2} />
                </div>

                {/* فلش راهنما در بالا سمت چپ کارت اصلی */}
                {isHeroCard && (
                  <div className="w-8 h-8 rounded-full bg-white/5 backdrop-blur-md flex items-center justify-center text-gold-500 group-hover:bg-gold-500 group-hover:text-emerald transition-all border border-white/10 shadow-sm">
                    <ChevronLeft className="w-4 h-4 md:w-5 md:h-5" />
                  </div>
                )}
              </div>
              
              {/* بخش پایینی: متون دکمه (کلاس mt-auto باعث می‌شود همیشه به پایین بچسبد) */}
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

      {/* ── 3. بخش پایانی: نمودار و تراکنش‌ها ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100/80 dark:border-gray-800/80">
        
        {/* نمودار هفتگی */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[15px] font-black text-gray-800 dark:text-gray-100">نمودار دارایی (هفتگی)</h3>
            <button className="text-[12px] font-bold text-gold-500 transition-opacity hover:opacity-70">
              گزارش کامل ←
            </button>
          </div>

          <div className="flex items-end justify-between gap-2 h-36">
            {CHART_DATA.map((d, i) => (
              <div key={d.day} className="flex flex-col items-center gap-3 w-full">
                <div
                  className="w-full max-w-7 rounded-t-lg transition-all duration-300 cursor-pointer min-h-1 relative group"
                  style={{
                    height: `${(d.value / maxBar) * 100}%`,
                    background: i === 5 ? "#c5a059" : "#e2e8f0",
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-20">
                    {d.value}م تومان
                  </div>
                </div>
                <span className="text-[11px] font-bold text-gray-400">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        {/* آخرین تراکنش‌ها */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-black text-gray-800 dark:text-gray-100">آخرین تراکنش‌ها</h3>
            <Link href="/dashboard/transactions" className="text-[12px] font-bold text-[#064e3b] dark:text-emerald-500 transition-opacity hover:opacity-70">
              همه تراکنش‌ها ←
            </Link>
          </div>

          <div className="flex flex-col gap-3 flex-1 justify-center">
            {TRANSACTIONS.slice(0, 4).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent hover:border-gray-100 dark:hover:border-gray-600"
              >
                <TxIcon type={tx.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-800 dark:text-gray-200 truncate">{tx.title}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{tx.date} · {tx.time}</p>
                </div>
                <div className="text-left shrink-0">
                  <p
                    className="text-[14px] font-black"
                    style={{ color: tx.amountType === "plus" ? "#16a34a" : "var(--color-red, #dc2626)" }}
                  >
                    {tx.amount}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-1">{tx.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}