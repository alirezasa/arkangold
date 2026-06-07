"use client";

import Link from "next/link";
import { CHART_DATA, TRANSACTIONS } from "@/app/utils/mock-data";
import type { Transaction } from "@/app/utils/types";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { 
  TrendingUp,
  TrendingDown,
  Flame,
  Coins,
  Gem,
  Hammer,
  GripHorizontal,
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

  // ─── اطلاعات بنرهای خدمات اصلی (لینک‌دار) ───
  const services = [
    { 
      title: "خرید و فروش طلای آبشده", 
      desc: "معامله لحظه‌ای، بدون کارمزد اضافی", 
      href: "/dashboard/melted-gold", 
      icon: Flame, 
      bg: "bg-gradient-to-l from-amber-50 to-white", 
      iconColor: "text-amber-500", 
      iconBg: "bg-amber-100/50",
      border: "border-amber-200"
    },
    { 
      title: "خرید شمش طلا", 
      desc: "شمش‌های ۲۴ عیار شرکتی", 
      href: "/dashboard/gold-ingot", 
      icon: GripHorizontal, 
      bg: "bg-white", 
      iconColor: "text-yellow-600", 
      iconBg: "bg-yellow-50",
      border: "border-gray-100 hover:border-yellow-300"
    },
    { 
      title: "نقره آب‌ شده", 
      desc: "سرمایه‌گذاری روی نقره", 
      href: "/dashboard/melted-silver", 
      icon: Coins, 
      bg: "bg-white", 
      iconColor: "text-slate-500", 
      iconBg: "bg-slate-100",
      border: "border-gray-100 hover:border-slate-300"
    },
    { 
      title: "خرید زیورآلات طلا", 
      desc: "گالری متنوع جواهرات", 
      href: "/dashboard/jewelry", 
      icon: Gem, 
      bg: "bg-white", 
      iconColor: "text-rose-500", 
      iconBg: "bg-rose-50",
      border: "border-gray-100 hover:border-rose-300"
    },
    { 
      title: "زرگری طلا", 
      desc: "طراحی و ساخت سفارشی", 
      href: "/dashboard/goldsmith", 
      icon: Hammer, 
      bg: "bg-white", 
      iconColor: "text-indigo-500", 
      iconBg: "bg-indigo-50",
      border: "border-gray-100 hover:border-indigo-300"
    },
  ];

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500" dir="rtl">
      
      {/* ── 1. نوار قیمت لحظه‌ای طلا ── */}
      <div className="rounded-2xl p-1 shadow-[0_8px_30px_rgba(251,191,36,0.15)] bg-white border border-amber-100 flex items-center justify-between">
        <div className="flex items-center gap-4 bg-gradient-to-r from-amber-400 via-amber-300 to-yellow-400 rounded-xl px-5 py-4 w-full relative overflow-hidden">
          {/* افکت‌های پس‌زمینه */}
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
          
          {/* درصد تغییرات */}
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

      {/* ── 2. بنرهای خدمات اصلی (تغییر چیدمان به گرید 3 ستونه در دسکتاپ) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service, idx) => {
          // بنر اول دو ستون در سایزهای بزرگتر می‌گیرد تا برجسته‌تر باشد
          const isHero = idx === 0;
          return (
            <Link 
              key={idx} 
              href={service.href}
              className={`group flex items-center justify-between p-5 rounded-[24px] transition-all duration-300 shadow-[0_2px_10px_rgba(0,0,0,0.02)] hover:shadow-md ${service.bg} ${service.border} border ${isHero ? 'md:col-span-2' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${service.iconBg} ${service.iconColor} group-hover:scale-110 transition-transform duration-300`}>
                  <service.icon className="w-6 h-6" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className={`font-bold text-gray-800 ${isHero ? 'text-[16px]' : 'text-[14px]'}`}>
                    {service.title}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-1 font-medium">
                    {service.desc}
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-gray-800 group-hover:text-white transition-colors border border-gray-100">
                <ChevronLeft className="w-4 h-4" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* ── 3. بخش پایانی: نمودار و تراکنش‌ها ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100/80">
        
        {/* نمودار هفتگی */}
        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-[15px] font-black text-gray-800">نمودار دارایی (هفتگی)</h3>
            <button className="text-[12px] font-bold text-amber-500 transition-opacity hover:opacity-70">
              گزارش کامل ←
            </button>
          </div>

          <div className="flex items-end justify-between gap-2 h-36">
            {CHART_DATA.map((d, i) => (
              <div key={d.day} className="flex flex-col items-center gap-3 w-full">
                <div
                  className="w-full max-w-[28px] rounded-t-lg transition-all duration-300 cursor-pointer min-h-1 relative group"
                  style={{
                    height: `${(d.value / maxBar) * 100}%`,
                    background: i === 5 ? "var(--color-gold-500)" : "#e2e8f0",
                  }}
                >
                  {/* Tooltip در هاور */}
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
        <div className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-black text-gray-800">آخرین تراکنش‌ها</h3>
            <Link href="/dashboard/transactions" className="text-[12px] font-bold text-[#064e3b] transition-opacity hover:opacity-70">
              همه تراکنش‌ها ←
            </Link>
          </div>

          <div className="flex flex-col gap-3 flex-1 justify-center">
            {TRANSACTIONS.slice(0, 4).map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-[16px] px-3 py-3 transition-colors hover:bg-gray-50 border border-transparent hover:border-gray-100"
              >
                <TxIcon type={tx.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold text-gray-800 truncate">{tx.title}</p>
                  <p className="text-[11px] text-gray-400 mt-1">{tx.date} · {tx.time}</p>
                </div>
                <div className="text-left shrink-0">
                  <p
                    className="text-[14px] font-black"
                    style={{ color: tx.amountType === "plus" ? "#16a34a" : "var(--color-red)" }}
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