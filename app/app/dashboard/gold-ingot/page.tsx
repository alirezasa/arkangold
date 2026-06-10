"use client";

import Link from "next/link";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { 
  ChevronRight, 
  Wallet, 
  Info,
  ShieldCheck,
  Package,
  ShoppingCart
} from "lucide-react";

// لیست شمش‌های استاندارد شرکتی
const INGOTS = [
  { id: 1, weight: 1, title: "شمش طلا ۱ گرمی", purity: "۲۴ عیار", fee: 250000, color: "from-yellow-100 to-yellow-50" },
  { id: 2, weight: 2.5, title: "شمش طلا ۲.۵ گرمی", purity: "۲۴ عیار", fee: 350000, color: "from-amber-100 to-amber-50" },
  { id: 3, weight: 5, title: "شمش طلا ۵ گرمی", purity: "۲۴ عیار", fee: 500000, color: "from-yellow-200 to-yellow-100" },
  { id: 4, weight: 10, title: "شمش طلا ۱۰ گرمی", purity: "۲۴ عیار", fee: 800000, color: "from-amber-200 to-amber-100" },
];

export default function GoldIngotPage() {
  const { data: goldData, loading: loadingGold } = useGoldPrice();
  
  // شبیه‌سازی قیمت پایه (۱۸ عیار)
  const basePrice18k = goldData?.price ? goldData.price * 1000 : 4500000; 
  // محاسبه تقریبی قیمت ۲۴ عیار (ضرب در ۲۴ و تقسیم بر ۱۸)
  const basePrice24k = Math.floor(basePrice18k * (24 / 18));

  // شبیه‌سازی موجودی کاربر
  const userBalance = {
    cash: 12500000,
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500" dir="rtl">
      
      {/* ── هدر صفحه ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <Link 
            href="/dashboard" 
            className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-sm shrink-0"
          >
            <ChevronRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-[20px] font-black text-gray-800">خرید شمش طلا</h1>
            <p className="text-[12px] text-gray-500 mt-1">شمش‌های ۲۴ عیار شرکتی با پلمپ امنیتی</p>
          </div>
        </div>

        {/* نمایش قیمت مبنا */}
        <div className="bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm flex items-center gap-3 w-max">
          <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
          <span className="text-[11px] font-bold text-gray-500">قیمت پایه ۲۴ عیار:</span>
          <div className="text-[14px] font-black text-gray-800">
            {loadingGold ? "..." : basePrice24k.toLocaleString('fa-IR')} <span className="text-[10px] text-gray-400 font-normal">تومان</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* ── ستون اصلی: لیست محصولات ── */}
        <div className="lg:col-span-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {INGOTS.map((ingot) => {
              // محاسبه قیمت نهایی هر شمش: (وزن * قیمت ۲۴ عیار) + اجرت پلمپ
              const finalPrice = (ingot.weight * basePrice24k) + ingot.fee;

              return (
                <div key={ingot.id} className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
                  {/* گرافیک شمش در پس‌زمینه */}
                  <div className={`absolute -right-6 -top-6 w-32 h-32 bg-linear-to-br ${ingot.color} rounded-full blur-2xl opacity-50 group-hover:opacity-80 transition-opacity`} />
                  
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-yellow-50 text-yellow-600 rounded-2xl flex items-center justify-center border border-yellow-100">
                          <Package className="w-6 h-6" strokeWidth={1.5} />
                        </div>
                        <div>
                          <h3 className="text-[15px] font-black text-gray-800">{ingot.title}</h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-[11px] font-bold text-gray-500">{ingot.purity}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 rounded-2xl p-3.5 mb-4 space-y-2 border border-gray-100/50">
                      <div className="flex justify-between items-center text-[12px]">
                        <span className="text-gray-500">ارزش طلای خالص:</span>
                        <span className="font-bold text-gray-700">{(ingot.weight * basePrice24k).toLocaleString('fa-IR')} تومان</span>
                      </div>
                      <div className="flex justify-between items-center text-[12px]">
                        <span className="text-gray-500">اجرت و بسته‌بندی:</span>
                        <span className="font-bold text-gray-700">{ingot.fee.toLocaleString('fa-IR')} تومان</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <span className="block text-[11px] text-gray-400 mb-0.5">قیمت نهایی</span>
                        <div className="text-[18px] font-black text-gray-800">
                          {loadingGold ? "..." : finalPrice.toLocaleString('fa-IR')} <span className="text-[11px] font-bold text-gray-500">تومان</span>
                        </div>
                      </div>
                      
                      <button className="flex items-center gap-2 bg-green-900 hover:bg-green-900 text-white px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all active:scale-95 shadow-[0_4px_15px_rgba(234,179,8,0.25)]">
                        <ShoppingCart className="w-4 h-4" />
                        خرید
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── ستون کناری: موجودی و اطلاعات ── */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* کارت موجودی */}
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-center gap-2 mb-6 text-gray-800">
              <Wallet className="w-5 h-5 text-yellow-600" />
              <h3 className="text-[14px] font-black">قدرت خرید شما</h3>
            </div>
            
            <div className="bg-gray-50 rounded-xl p-4 flex justify-between items-center border border-gray-100/80">
              <span className="text-[12px] font-bold text-gray-500">موجودی نقدی</span>
              <div className="text-left">
                <span className="text-[18px] font-black text-emerald-600">{userBalance.cash.toLocaleString('fa-IR')}</span>
                <span className="text-[10px] text-gray-400 mr-1 font-bold">تومان</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <Link href="/dashboard/deposit" className="block w-full text-center py-3 bg-green-800 text-white rounded-xl text-[13px] font-bold transition-colors hover:bg-green-800 shadow-md shadow-gray-900/20">
                افزایش موجودی کیف پول
              </Link>
            </div>
          </div>

          {/* کارت قوانین / راهنما */}
          <div className="bg-yellow-50/50 rounded-3xl p-5 border border-yellow-100/50">
            <div className="flex gap-3 text-yellow-800/80">
              <Info className="w-5 h-5 shrink-0 text-yellow-600" />
              <div className="text-[11px] leading-relaxed font-medium space-y-2.5">
                <p>• تمامی شمش‌ها دارای پلمپ امنیتی هولوگرام‌دار شرکتی و فاکتور رسمی می‌باشند.</p>
                <p>• عیار شمش‌ها **۲۴ (۹۹۵)** می‌باشد و قیمت پایه آن با طلای ۱۸ عیار متفاوت است.</p>
                <p>• پس از خرید، می‌توانید درخواست **تحویل فیزیکی** در شعب منتخب را ثبت نمایید یا آن را در صندوق امانات خود نگهداری کنید.</p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}