"use client";

import { CHART_DATA, TRANSACTIONS } from "@/app/utils/mock-data";
import type { Transaction } from "@/app/utils/types";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { 
  EyeOff, 
  ArrowRightLeft, 
  Wallet, 
  Clock, 
  Gift, 
  CalendarDays, 
  Truck,
  TrendingUp,
  TrendingDown
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

// ─── صفحه اصلی ───
export default function DashboardPage() {
  const { data: goldData, loading: loadingGold } = useGoldPrice();
  const maxBar = Math.max(...CHART_DATA.map((d) => d.value));

  const actions = [
    { title: "خرید و فروش", icon: ArrowRightLeft, badge: "بیمه شده", badgeColor: "bg-blue-500" },
    { title: "واریز و برداشت", icon: Wallet },
    { title: "سفارش با قیمت", icon: Clock },
    { title: "ثبت کارت هدیه", icon: Gift },
    { title: "خرید اقساطی", icon: CalendarDays },
    { title: "تحویل فیزیکی", icon: Truck, badge: "درب منزل", badgeColor: "bg-[#064e3b]" },
  ];

  const isPositiveChange = (goldData?.change24h ?? 0) >= 0;

  return (
    // افزایش عرض به max-w-5xl برای استفاده بهتر از فضای دسکتاپ
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500" dir="rtl">
      
      {/* ── 1. نوار قیمت لحظه‌ای طلا (مدرن و متصل به تم) ── */}
      <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3 bg-amber-50/50 rounded-xl px-4 py-3 w-full">
          <div className="w-10 h-10 rounded-full bg-amber-100/80 flex items-center justify-center shrink-0">
            <span className="live-dot absolute w-2 h-2 bg-amber-500 rounded-full animate-ping opacity-75" />
            <span className="relative w-2 h-2 bg-amber-500 rounded-full" />
          </div>
          <div className="flex flex-col">
            <span className="text-[12px] font-bold text-gray-500">قیمت لحظه ای طلا (۱۸ عیار)</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[16px] sm:text-[18px] font-black text-[#064e3b]">
                {loadingGold ? "درحال دریافت..." : Number((goldData?.price ?? 0) * 1000).toLocaleString('fa-IR')}
                <span className="text-[11px] text-gray-500 mr-1 font-bold">تومان</span>
              </span>
            </div>
          </div>
          
          {/* درصد تغییرات */}
          {!loadingGold && goldData && (
            <div className={`mr-auto flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-bold ${
              isPositiveChange ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
            }`} dir="ltr">
              {isPositiveChange ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {isPositiveChange ? "+" : ""}{goldData.change24h}٪
            </div>
          )}
        </div>
      </div>

      {/* گرید بندی برای دسکتاپ (کارت کیف پول سمت راست، اکشن‌ها سمت چپ) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ── 2. کارت کیف پول جمع‌وجور (ستون ۵ تایی در دسکتاپ) ── */}
        <div className="lg:col-span-5 relative bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] rounded-[24px] p-6 overflow-hidden shadow-sm border border-gray-200/50">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-amber-200/30 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-[#064e3b]/5 rounded-full blur-3xl pointer-events-none" />

          <button 
            className="absolute top-5 left-5 text-gray-400 hover:text-gray-700 bg-white/60 p-2.5 rounded-xl backdrop-blur-sm transition-all active:scale-95 shadow-sm"
            aria-label="مخفی کردن موجودی"
          >
            <EyeOff className="w-5 h-5" />
          </button>

          <div className="text-center relative z-10 mt-4 mb-2">
            <p className="text-[13px] font-bold text-gray-500 mb-2">ارزش کل دارایی</p>
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-[36px] font-black text-gray-800">۰</span>
              <span className="text-[14px] font-bold text-gray-600 mt-3">تومان</span>
            </div>
          </div>

          <div className="flex bg-white/80 backdrop-blur-md rounded-[20px] mt-8 p-4 shadow-sm relative z-10 border border-white">
            <div className="flex-1 text-center border-l border-gray-200/60 border-dashed">
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">موجودی طلا</p>
              <div className="flex items-baseline justify-center gap-1">
                <p className="text-[16px] font-black text-[#064e3b]">۰</p>
                <span className="text-[10px] font-bold text-gray-400">گرم</span>
              </div>
            </div>
            <div className="flex-1 text-center">
              <p className="text-[11px] font-bold text-gray-500 mb-1.5">موجودی نقدی</p>
              <div className="flex items-baseline justify-center gap-1">
                <p className="text-[16px] font-black text-[#064e3b]">۰</p>
                <span className="text-[10px] font-bold text-gray-400">تومان</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 3. گرید دکمه‌های اکشن (ستون ۷ تایی در دسکتاپ) ── */}
        <div className="lg:col-span-7 grid grid-cols-3 gap-3 sm:gap-4 content-start">
          {actions.map((action, idx) => (
            <button
              key={idx}
              className="group relative flex flex-col items-center justify-center bg-white border border-gray-100 shadow-[0_4px_16px_rgba(0,0,0,0.02)] rounded-[20px] p-4 lg:p-6 aspect-square sm:aspect-auto sm:h-[135px] transition-all duration-300 hover:shadow-md hover:border-amber-200/60 active:scale-95"
            >
              {action.badge && (
                <span className={`absolute -top-2.5 right-1/2 translate-x-1/2 whitespace-nowrap ${action.badgeColor} text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full z-10 shadow-sm`}>
                  {action.badge}
                </span>
              )}
              
              <div className="relative mb-3 sm:mb-4 text-[#064e3b]/80 group-hover:text-amber-500 transition-colors">
                <div className="absolute inset-0 bg-amber-100 translate-x-1 translate-y-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity" />
                <action.icon className="w-8 h-8 lg:w-9 lg:h-9 relative z-10" strokeWidth={1.5} />
              </div>
              
              <span className="text-[11px] sm:text-[13px] font-bold text-gray-700 group-hover:text-[#064e3b] transition-colors text-center leading-tight">
                {action.title}
              </span>
            </button>
          ))}
        </div>

      </div>

      {/* ── 4. بخش نمودار و تراکنش‌ها ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-100/80">
        {/* نمودار هفتگی */}
        <div
          className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100"
        >
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
        <div
          className="bg-white rounded-[24px] p-6 shadow-sm border border-gray-100 flex flex-col"
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-[15px] font-black text-gray-800">آخرین تراکنش‌ها</h3>
            <button className="text-[12px] font-bold text-[#064e3b] transition-opacity hover:opacity-70">
              همه تراکنش‌ها ←
            </button>
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