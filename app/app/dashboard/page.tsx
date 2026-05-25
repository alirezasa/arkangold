"use client";

import React, { useState } from 'react';
import { 
  Bell, 
  User, 
  TrendingUp, 
  ShieldCheck, 
  Headset, 
  Gem, 
  Wallet, 
  LineChart, 
  Home, 
  ArrowLeftRight, 
  Grid
} from 'lucide-react';

export default function HomePage() {
  const [chartPeriod, setChartPeriod] = useState('1D');

  return (
    <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-800">
      
      {/* هدر */}
      <header className="flex justify-between items-center px-5 py-4 bg-white sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
            <User size={20} />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800">آرکان گالری</h1>
            <p className="text-xs text-slate-500">خرید و فروش امن طلا</p>
          </div>
        </div>
        <button className="relative w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
        </button>
      </header>

      <main className="px-5 mt-4 space-y-6">
        
        {/* کارت اصلی (قیمت لحظه‌ای و ورود) - گرادیانت آبی تیره */}
        <section className="bg-linear-to-br from-indigo-900 via-slate-800 to-indigo-900 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
          {/* افکت پس زمینه */}
          <div className="absolute -top-10 -left-10 w-32 h-32 bg-indigo-500 opacity-20 rounded-full blur-2xl"></div>
          
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-indigo-200 text-sm mb-1">مظنه طلای آبشده (مثقال)</p>
                <div className="flex items-center gap-2">
                  <h2 className="text-3xl font-bold tracking-tight">۱۴,۸۵۰,۰۰۰</h2>
                  <span className="text-sm text-indigo-200">تومان</span>
                </div>
              </div>
              <div className="flex items-center gap-1 text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-lg text-xs font-medium">
                <TrendingUp size={14} />
                <span>+۱.۲٪</span>
              </div>
            </div>

            <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10 mt-6 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">به آرکان گالری خوش آمدید</p>
                <p className="text-xs text-indigo-200 mt-1">برای شروع معامله وارد شوید</p>
              </div>
              <button className="bg-white text-indigo-900 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-indigo-50 transition">
                ورود / ثبت‌نام
              </button>
            </div>
          </div>
        </section>

        {/* دسترسی سریع (خدمات) */}
        <section>
          <h3 className="text-sm font-bold text-slate-800 mb-3 px-1">دسترسی سریع</h3>
          <div className="grid grid-cols-4 gap-3">
            {[
              { icon: Wallet, label: 'کیف پول', color: 'text-blue-600', bg: 'bg-blue-50' },
              { icon: LineChart, label: 'نمودار', color: 'text-indigo-600', bg: 'bg-indigo-50' },
              { icon: ShieldCheck, label: 'اصالت', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { icon: Headset, label: 'پشتیبانی', color: 'text-amber-600', bg: 'bg-amber-50' },
            ].map((item, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <div className={`w-14 h-14 ${item.bg} ${item.color} rounded-2xl flex items-center justify-center shadow-sm border border-white`}>
                  <item.icon size={24} strokeWidth={1.5} />
                </div>
                <span className="text-xs text-slate-600 font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* نمودار تغییرات قیمت */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-slate-800">روند قیمت طلا</h3>
            {/* تایم فریم های نمودار */}
            <div className="flex bg-slate-100 rounded-lg p-1">
              {['1D', '1W', '1M', '1Y'].map((period) => (
                <button
                  key={period}
                  onClick={() => setChartPeriod(period)}
                  className={`text-xs px-3 py-1 rounded-md transition-colors ${
                    chartPeriod === period 
                      ? 'bg-white text-indigo-600 font-bold shadow-sm' 
                      : 'text-slate-500'
                  }`}
                >
                  {period === '1D' ? 'روز' : period === '1W' ? 'هفته' : period === '1M' ? 'ماه' : 'سال'}
                </button>
              ))}
            </div>
          </div>
          
          {/* بخش بصری نمودار (شماتیک با SVG) */}
          <div className="h-40 w-full relative flex items-end">
             {/* خطوط پس‌زمینه */}
            <div className="absolute inset-0 flex flex-col justify-between py-2">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="w-full border-t border-slate-100 border-dashed"></div>
              ))}
            </div>
            {/* نمودار شماتیک */}
            <svg className="w-full h-full relative z-10" viewBox="0 0 100 40" preserveAspectRatio="none">
              <defs>
                <linearGradient id="gradientArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.2"/>
                  <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path 
                d="M0,30 Q10,20 20,25 T40,15 T60,20 T80,5 T100,10 L100,40 L0,40 Z" 
                fill="url(#gradientArea)" 
              />
              <path 
                d="M0,30 Q10,20 20,25 T40,15 T60,20 T80,5 T100,10" 
                fill="none" 
                stroke="#10b981" 
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </section>

        {/* بنر اطلاع رسانی کوچک */}
        <section className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3">
          <div className="bg-amber-100 text-amber-600 p-2 rounded-xl">
            <Gem size={20} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-900">خرید بدون کارمزد!</h4>
            <p className="text-xs text-amber-700 mt-1">ویژه کاربران جدید تا پایان ماه</p>
          </div>
        </section>

      </main>

      {/* منوی ناوبری پایین (Bottom Nav) */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-100 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.02)] z-50">
        <div className="flex justify-around items-center h-16">
          <button className="flex flex-col items-center gap-1 text-indigo-600">
            <Home size={22} strokeWidth={2} />
            <span className="text-[10px] font-bold">خانه</span>
          </button>
          
          {/* دکمه برجسته وسط */}
          <button className="relative -top-5 bg-indigo-600 text-white w-14 h-14 rounded-full flex items-center justify-center shadow-lg shadow-indigo-200 border-4 border-white hover:bg-indigo-700 transition">
            <ArrowLeftRight size={24} />
          </button>
          
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition">
            <Grid size={22} />
            <span className="text-[10px] font-medium">سایر</span>
          </button>
        </div>
      </nav>

    </div>
  );
}