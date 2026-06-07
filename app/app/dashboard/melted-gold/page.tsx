"use client";

import { useState } from "react";
import Link from "next/link";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { 
  ChevronRight, 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Wallet, 
  Info,
  Scale,
  Banknote,
  Truck,
  ShieldCheck
} from "lucide-react";

export default function MeltedGoldPage() {
  const { data: goldData, loading: loadingGold } = useGoldPrice();
  
  // استیت‌های مدیریت فرم
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [deliveryMethod, setDeliveryMethod] = useState<"vault" | "physical">("vault");
  const [amount, setAmount] = useState<string>(""); 
  const [weight, setWeight] = useState<string>(""); 

  // شبیه‌سازی قیمت برای محاسبات
  const currentPrice = goldData?.price ? goldData.price * 1000 : 4500000; 

  // شبیه‌سازی موجودی کاربر
  const userBalance = {
    cash: 12500000,
    gold: 14.5,    
  };

  // هندلر تغییر مبلغ
  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    setAmount(val);
    if (val && currentPrice) {
      const calculatedWeight = (Number(val) / currentPrice).toFixed(3);
      setWeight(calculatedWeight);
    } else {
      setWeight("");
    }
  };

  // هندلر تغییر وزن
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
          <h1 className="text-[20px] font-black text-gray-800">خرید و فروش طلای آبشده</h1>
          <p className="text-[12px] text-gray-500 mt-1">بدون کارمزد، معامله با قیمت لحظه‌ای بازار</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ── ستون اصلی: فرم معامله ── */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* باکس قیمت لحظه‌ای */}
          <div className="bg-gradient-to-r from-amber-50 to-amber-100/50 border border-amber-200/60 rounded-[24px] p-5 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-amber-100">
                <span className="live-dot absolute w-2.5 h-2.5 bg-red-500 rounded-full animate-ping opacity-75" />
                <span className="relative w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
              </div>
              <div>
                <p className="text-[12px] font-bold text-amber-900/60">مظنه فروش بازار (۱۸ عیار)</p>
                <div className="text-[20px] font-black text-amber-950 mt-0.5">
                  {loadingGold ? "..." : currentPrice.toLocaleString('fa-IR')} <span className="text-[13px] font-bold text-amber-800/70">تومان</span>
                </div>
              </div>
            </div>
          </div>

          {/* کارت اصلی خرید و فروش */}
          <div className="bg-white rounded-[24px] p-2 shadow-sm border border-gray-100">
            {/* تب‌ها */}
            <div className="flex bg-gray-50/80 p-1.5 rounded-[20px] mb-6">
              <button
                onClick={() => setTradeType("buy")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-[14px] font-bold transition-all duration-300 ${
                  tradeType === "buy" 
                    ? "bg-white text-emerald-600 shadow-sm border border-gray-100/50" 
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <ArrowDownCircle className="w-5 h-5" />
                خرید طلا
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[16px] text-[14px] font-bold transition-all duration-300 ${
                  tradeType === "sell" 
                    ? "bg-white text-red-500 shadow-sm border border-gray-100/50" 
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <ArrowUpCircle className="w-5 h-5" />
                فروش طلا
              </button>
            </div>

            <div className="px-4 pb-4 space-y-5">
              {/* ورودی مبلغ */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-600 flex items-center justify-between">
                  <span>مبلغ {tradeType === "buy" ? "پرداختی" : "دریافتی"}</span>
                  <span className="text-[11px] font-normal text-gray-400">تومان</span>
                </label>
                <div className="relative">
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <Banknote className="w-5 h-5" />
                  </div>
                  <input 
                    type="text"
                    value={amount ? Number(amount).toLocaleString('fa-IR') : ""}
                    onChange={handleAmountChange}
                    placeholder="مثلا ۵,۰۰۰,۰۰۰"
                    className="w-full bg-white border-2 border-gray-100 hover:border-gray-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 rounded-2xl py-4 pr-12 pl-4 text-left text-[18px] font-black text-gray-800 transition-all outline-none placeholder:text-gray-300 placeholder:font-normal"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* آیکون اتصال (فلش دوطرفه) */}
              <div className="flex justify-center -my-2 relative z-10">
                <div className="bg-gray-50 border-2 border-white rounded-full p-1.5 text-gray-400">
                  <Scale className="w-4 h-4" />
                </div>
              </div>

              {/* ورودی وزن */}
              <div className="space-y-2">
                <label className="text-[13px] font-bold text-gray-600 flex items-center justify-between">
                  <span>وزن طلای {tradeType === "buy" ? "دریافتی" : "پرداختی"}</span>
                  <span className="text-[11px] font-normal text-gray-400">گرم (عیار ۱۸)</span>
                </label>
                <div className="relative">
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <div className="w-5 h-5 flex items-center justify-center font-bold text-[10px] bg-gray-100 rounded-md">gr</div>
                  </div>
                  <input 
                    type="text"
                    value={weight}
                    onChange={handleWeightChange}
                    placeholder="مثلا ۱.۲۵"
                    className="w-full bg-white border-2 border-gray-100 hover:border-gray-200 focus:border-amber-400 focus:ring-4 focus:ring-amber-400/10 rounded-2xl py-4 pr-12 pl-4 text-left text-[18px] font-black text-gray-800 transition-all outline-none placeholder:text-gray-300 placeholder:font-normal"
                    dir="ltr"
                  />
                </div>
              </div>

              {/* انتخاب روش دریافت (فقط در حالت خرید) */}
              {tradeType === "buy" && (
                <div className="space-y-3 pt-3 border-t border-gray-100/80">
                  <label className="text-[13px] font-bold text-gray-600">روش دریافت طلا</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod("vault")}
                      className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-all ${
                        deliveryMethod === "vault" 
                          ? "border-amber-400 bg-amber-50 text-amber-700 shadow-[0_0_15px_rgba(251,191,36,0.15)]" 
                          : "border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      <ShieldCheck className={`w-5 h-5 ${deliveryMethod === "vault" ? "text-amber-500" : ""}`} />
                      <div className="text-center">
                        <span className="block text-[13px] font-bold">نگهداری در صندوق</span>
                        <span className="block text-[10px] opacity-70 mt-0.5">امن و بدون کارمزد</span>
                      </div>
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod("physical")}
                      className={`flex flex-col items-center justify-center gap-2 p-3.5 rounded-2xl border-2 transition-all ${
                        deliveryMethod === "physical" 
                          ? "border-amber-400 bg-amber-50 text-amber-700 shadow-[0_0_15px_rgba(251,191,36,0.15)]" 
                          : "border-gray-100 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}
                    >
                      <Truck className={`w-5 h-5 ${deliveryMethod === "physical" ? "text-amber-500" : ""}`} />
                      <div className="text-center">
                        <span className="block text-[13px] font-bold">تحویل فیزیکی</span>
                        <span className="block text-[10px] opacity-70 mt-0.5">ارسال به آدرس شما</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* دکمه اکشن */}
              <button 
                className={`w-full py-4 rounded-2xl text-[15px] font-black text-white transition-all active:scale-[0.98] shadow-lg mt-4 ${
                  tradeType === "buy" 
                    ? "bg-emerald-500 hover:bg-emerald-600 shadow-emerald-500/30" 
                    : "bg-red-500 hover:bg-red-600 shadow-red-500/30"
                }`}
              >
                {tradeType === "buy" ? "ثبت سفارش خرید" : "ثبت سفارش فروش"}
              </button>
            </div>
          </div>
        </div>

        {/* ── ستون کناری: موجودی و اطلاعات ── */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* کارت موجودی */}
          <div className="bg-white rounded-[24px] p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-6 text-gray-800">
              <Wallet className="w-5 h-5 text-amber-500" />
              <h3 className="text-[14px] font-black">موجودی کیف پول</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl p-3.5 flex justify-between items-center">
                <span className="text-[12px] font-bold text-gray-500">موجودی نقدی</span>
                <div className="text-left">
                  <span className="text-[15px] font-black text-gray-800">{userBalance.cash.toLocaleString('fa-IR')}</span>
                  <span className="text-[10px] text-gray-400 mr-1">تومان</span>
                </div>
              </div>
              <div className="bg-amber-50/50 border border-amber-100/50 rounded-xl p-3.5 flex justify-between items-center">
                <span className="text-[12px] font-bold text-amber-800/70">موجودی طلا</span>
                <div className="text-left">
                  <span className="text-[15px] font-black text-amber-600">{userBalance.gold}</span>
                  <span className="text-[10px] text-amber-500/70 mr-1">گرم</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
              <Link href="/dashboard/deposit" className="flex-1 text-center py-2 bg-blue-50 text-blue-600 rounded-lg text-[12px] font-bold transition-colors hover:bg-blue-100">
                + افزایش موجودی
              </Link>
            </div>
          </div>

          {/* کارت قوانین / راهنما */}
          <div className="bg-slate-50 rounded-[24px] p-5 border border-slate-100">
            <div className="flex gap-3 text-slate-600">
              <Info className="w-5 h-5 shrink-0 text-slate-400" />
              <div className="text-[11px] leading-relaxed font-medium space-y-2">
                <p>• معاملات آبشده بدون احتساب مالیات و اجرت محاسبه می‌گردد.</p>
                <p>• قیمت‌ها هر ۱۰ ثانیه بر اساس مظنه بازار تهران بروزرسانی می‌شود.</p>
                <p>• نگهداری در صندوق امانات پلتفرم کاملاً **رایگان** و **بیمه‌شده** است.</p>
                <p>• در صورت انتخاب **تحویل فیزیکی**، حداقل وزن مجاز **۱۰ گرم** بوده و هزینه پلمپ و ارسال جداگانه محاسبه می‌گردد.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}