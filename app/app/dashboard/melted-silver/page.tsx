"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  ChevronRight, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Wallet, 
  Info,
  Scale,
  Banknote,
  Coins
} from "lucide-react";

export default function MeltedSilverPage() {
  // استیت‌های مدیریت فرم خرید و فروش
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState<string>(""); // مبلغ به تومان
  const [weight, setWeight] = useState<string>(""); // وزن به گرم

  // شبیه‌سازی قیمت لحظه‌ای نقره (مثلاً ۸۵ هزار تومان برای هر گرم نقره ساچمه/آبشده ۹۹۹)
  const currentPrice = 85000; 

  // شبیه‌سازی موجودی کاربر
  const userBalance = {
    cash: 12500000, // تومان
    silver: 250.5,  // گرم نقره
  };

  // هندلر تغییر مبلغ (محاسبه خودکار وزن)
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmount(val);
    if (val && currentPrice) {
      const calculatedWeight = (Number(val) / currentPrice).toFixed(2);
      setWeight(calculatedWeight);
    } else {
      setWeight("");
    }
  };

  // هندلر تغییر وزن (محاسبه خودکار مبلغ)
  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    setWeight(val);
    if (val && currentPrice) {
      const calculatedAmount = Math.floor(Number(val) * currentPrice).toString();
      setAmount(calculatedAmount);
    } else {
      setAmount("");
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500" dir="rtl">
      
      {/* ── هدر صفحه ── */}
      <div className="flex items-center gap-4 mb-8">
        <Link 
          href="/dashboard" 
          className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-sm"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[20px] font-black text-slate-800">خرید و فروش نقره آب‌شده</h1>
          <p className="text-[12px] text-slate-500 mt-1">سرمایه‌گذاری امن روی نقره با خلوص ۹۹۹</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ── ستون اصلی: فرم معامله ── */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* باکس قیمت لحظه‌ای (تم نقره‌ای) */}
          <div className="bg-gradient-to-r from-slate-100 to-slate-50 border border-slate-200/80 rounded-[24px] p-5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-slate-200 text-slate-600">
                <Coins className="w-6 h-6" strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-[12px] font-bold text-slate-500">قیمت لحظه‌ای نقره (عیار ۹۹۹)</p>
                <div className="text-[20px] font-black text-slate-800 mt-0.5">
                  {currentPrice.toLocaleString('fa-IR')} <span className="text-[13px] font-bold text-slate-500">تومان</span>
                </div>
              </div>
            </div>
            {/* افکت چشمک‌زن وضعیت بازار */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-100 shadow-sm">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-slate-500">بازار باز است</span>
            </div>
          </div>

          {/* کارت اصلی خرید و فروش */}
          <div className="bg-white rounded-[24px] p-2 shadow-sm border border-slate-100">
            {/* تب‌ها */}
            <div className="flex bg-slate-50/80 p-1.5 rounded-[20px] mb-6 border border-slate-100/50">
              <button
                onClick={() => setTradeType("buy")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-[14px] font-bold transition-all duration-300 ${
                  tradeType === "buy" 
                    ? "bg-white text-emerald-600 shadow-sm border border-slate-100/50" 
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <ArrowDownCircle className="w-5 h-5" />
                خرید نقره
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-[14px] font-bold transition-all duration-300 ${
                  tradeType === "sell" 
                    ? "bg-white text-rose-500 shadow-sm border border-slate-100/50" 
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <ArrowUpCircle className="w-5 h-5" />
                فروش نقره
              </button>
            </div>

            <div className="px-4 pb-4 space-y-5">
              {/* ورودی مبلغ */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-slate-600 flex items-center justify-between">
                  <span>مبلغ {tradeType === "buy" ? "پرداختی" : "دریافتی"}</span>
                  <span className="text-[11px] font-normal text-slate-400">تومان</span>
                </label>
                <div className="relative">
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <input 
                    type="text"
                    value={amount ? Number(amount).toLocaleString('fa-IR') : ""}
                    onChange={handleAmountChange}
                    placeholder="مثلا ۱,۰۰۰,۰۰۰"
                    className="w-full bg-white border-2 border-slate-100 hover:border-slate-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-400/10 rounded-2xl py-4 pr-12 pl-4 text-left text-[18px] font-black text-slate-800 transition-all outline-none placeholder:text-slate-300 placeholder:font-normal"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* آیکون اتصال (فلش دوطرفه) */}
              <div className="flex justify-center -my-2 relative z-10">
                <div className="bg-slate-50 border-2 border-white rounded-full p-1.5 text-slate-400">
                  <Scale className="w-4 h-4" />
                </div>
              </div>

              {/* ورودی وزن */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-slate-600 flex items-center justify-between">
                  <span>وزن نقره {tradeType === "buy" ? "دریافتی" : "پرداختی"}</span>
                  <span className="text-[11px] font-normal text-slate-400">گرم (عیار ۹۹۹)</span>
                </label>
                <div className="relative">
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                    <div className="w-5 h-5 flex items-center justify-center font-bold text-[10px] bg-slate-100 text-slate-500 rounded-md">gr</div>
                  </div>
                  <input 
                    type="text"
                    value={weight}
                    onChange={handleWeightChange}
                    placeholder="مثلا ۱۱.۵"
                    className="w-full bg-white border-2 border-slate-100 hover:border-slate-200 focus:border-slate-400 focus:ring-4 focus:ring-slate-400/10 rounded-2xl py-4 pr-12 pl-4 text-left text-[18px] font-black text-slate-800 transition-all outline-none placeholder:text-slate-300 placeholder:font-normal"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* دکمه اکشن */}
              <button 
                className={`w-full py-4 rounded-2xl text-[15px] font-black text-white transition-all active:scale-[0.98] shadow-lg mt-4 ${
                  tradeType === "buy" 
                    ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30" 
                    : "bg-rose-500 hover:bg-rose-600 shadow-rose-500/30"
                }`}
              >
                {tradeType === "buy" ? "ثبت سفارش خرید نقره" : "ثبت سفارش فروش نقره"}
              </button>
            </div>
          </div>
        </div>

        {/* ── ستون کناری: موجودی و اطلاعات ── */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* کارت موجودی */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-6 text-slate-800">
              <Wallet className="w-5 h-5 text-slate-500" />
              <h3 className="text-[14px] font-black">موجودی کیف پول</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-3.5 flex justify-between items-center border border-slate-100/50">
                <span className="text-[12px] font-bold text-slate-500">موجودی نقدی</span>
                <div className="text-left">
                  <span className="text-[15px] font-black text-slate-800">{userBalance.cash.toLocaleString('fa-IR')}</span>
                  <span className="text-[10px] text-slate-400 mr-1">تومان</span>
                </div>
              </div>
              <div className="bg-gradient-to-l from-slate-100 to-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex justify-between items-center">
                <span className="text-[12px] font-bold text-slate-700">موجودی نقره</span>
                <div className="text-left">
                  <span className="text-[15px] font-black text-slate-800">{userBalance.silver}</span>
                  <span className="text-[10px] text-slate-500 mr-1">گرم</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 flex gap-2">
              <Link href="/dashboard/deposit" className="flex-1 text-center py-2 bg-blue-50 text-blue-600 rounded-lg text-[12px] font-bold transition-colors hover:bg-blue-100">
                + افزایش موجودی
              </Link>
            </div>
          </div>

          {/* کارت قوانین / راهنما */}
          <div className="bg-slate-50 rounded-[24px] p-5 border border-slate-200/60">
            <div className="flex gap-3 text-slate-600">
              <Info className="w-5 h-5 shrink-0 text-slate-400" />
              <div className="text-[11px] leading-relaxed font-medium space-y-2">
                <p>• نقره معامله شده در این بخش از نوع ساچمه یا آبشده با خلوص استاندارد ۹۹۹ (نقره خالص) می‌باشد.</p>
                <p>• حداقل مقدار برای ثبت سفارش خرید یا فروش، معادل **۱۰ گرم** نقره است.</p>
                <p>• اسپرد (اختلاف قیمت خرید و فروش) در نقره نسبت به طلا ممکن است متفاوت باشد.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}