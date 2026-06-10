"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ShoppingCart, Search, Sparkles } from "lucide-react";

// این بخش در آینده از دیتابیس (پنل ادمین) فراخوانی می‌شود
const PRODUCTS_MOCK = [
  { id: 1, title: "انگشتر طلا ظریف", price: 8500000, category: "انگشتر", image: "💍" },
  { id: 2, title: "گردنبند زنجیری", price: 12400000, category: "گردنبند", image: "📿" },
  { id: 3, title: "دستبند کارتیه", price: 15900000, category: "دستبند", image: "⌚" },
  { id: 4, title: "گوشواره حلقه‌ای", price: 6200000, category: "گوشواره", image: "👂" },
];

const CATEGORIES = ["همه", "انگشتر", "گردنبند", "دستبند", "گوشواره"];

export default function JewelryPage() {
  const [selectedCategory, setSelectedCategory] = useState("همه");

  // فیلتر کردن محصولات بر اساس دسته‌بندیP
  const filteredProducts = selectedCategory === "همه" 
    ? PRODUCTS_MOCK 
    : PRODUCTS_MOCK.filter(p => p.category === selectedCategory);

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-24 animate-in fade-in duration-500" dir="rtl">
      
      {/* ── هدر صفحه ── */}
      <div className="flex items-center gap-4 mb-4">
        <Link 
          href="/dashboard" 
          className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors shadow-sm"
        >
          <ChevronRight className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-[20px] font-black text-gray-800">گالری زیورآلات</h1>
          <p className="text-[12px] text-gray-500 mt-1">طراحی‌های خاص و هنری با بهترین کیفیت</p>
        </div>
      </div>

      {/* ── نوار فیلتر و جستجو ── */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex gap-1 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0 scrollbar-hide">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat 
                  ? "bg-rose-500 text-white shadow-md shadow-rose-500/20" 
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="جستجوی محصول..."
            className="w-full bg-gray-50 border-none rounded-xl py-2.5 pr-10 text-[13px] font-bold text-gray-700 focus:ring-2 focus:ring-rose-200 outline-none"
          />
        </div>
      </div>

      {/* ── گرید محصولات ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredProducts.map(product => (
          <div key={product.id} className="bg-white rounded-3xl p-4 border border-gray-100 shadow-sm hover:shadow-lg transition-all group">
            <div className="aspect-square bg-gray-50 rounded-[20px] mb-4 flex items-center justify-center text-[60px] group-hover:scale-105 transition-transform">
              {product.image}
            </div>
            
            <h3 className="text-[14px] font-bold text-gray-800 mb-1">{product.title}</h3>
            <p className="text-[11px] text-gray-400 mb-3">{product.category}</p>
            
            <div className="flex items-center justify-between mt-auto">
              <div className="text-[14px] font-black text-rose-600">
                {product.price.toLocaleString('fa-IR')}
                <span className="text-[10px] mr-1 font-bold">تومان</span>
              </div>
              <button className="w-9 h-9 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors">
                <ShoppingCart className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── بخش سفارشی‌سازی (زرگری) ── */}
      <div className="bg-linear-to-l from-rose-500 to-indigo-600 rounded-3xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl shadow-indigo-500/20">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-[16px] font-black">طراحی و ساخت سفارشی</h3>
            <p className="text-[12px] opacity-80 mt-1">طرح مورد نظر خود را برای ما ارسال کنید</p>
          </div>
        </div>
        <Link href="/dashboard/goldsmith" className="bg-white text-indigo-600 px-6 py-3 rounded-xl text-[13px] font-black hover:bg-gray-50 transition-colors">
          سفارش ساخت
        </Link>
      </div>
    </div>
  );
}