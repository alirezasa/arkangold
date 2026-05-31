"use client";

import React from "react";
import { useRouter } from "next/navigation";

interface MobileProfileProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function MobileProfile({ isOpen, onClose }: MobileProfileProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      console.error("خطا در خروج");
    }
  };

  return (
    <div 
      className="fixed inset-0 z-9999 flex flex-col h-dvh overflow-y-auto lg:hidden animate-in slide-in-from-bottom duration-200"
      style={{ backgroundColor: "#f4f5f7" }}
      dir="rtl"
    >
      {/* هدر اپلیکیشنی ثابت */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 bg-[#f4f5f7]">
        <button 
          onClick={onClose} 
          className="p-1.5 rounded-full bg-white text-gray-500 active:scale-90 transition-transform shadow-sm border border-gray-100"
        >
          <i className="ti ti-x text-[20px]"></i>
        </button>
        <h2 className="text-[16px] font-black text-gray-900">حساب کاربری</h2>
        <div className="w-9"></div> {/* ایجاد تقارن کامل هدر */}
      </div>

      {/* محتوای اسکرول شونده منو */}
      <div className="flex-1 px-4 pb-10 space-y-4">
        
        {/* ۱. کارت اطلاعات کاربر اصلی با تیک تایید */}
        <div className="flex items-center justify-between p-5 bg-white rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-gray-50/50 active:scale-[0.99] transition-transform cursor-pointer">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex items-center justify-center w-14 h-14 bg-gray-50 rounded-full border border-gray-100">
                <i className="ti ti-user text-[28px] text-gray-400"></i>
              </div>
              {/* تیک سبز تایید هویت مشابه اسنپ/دیجی‌کالا */}
              <div className="absolute -bottom-1 -right-1 p-0.5 bg-white rounded-full shadow-sm">
                <i className="ti ti-circle-check-filled text-[18px] text-emerald-500"></i>
              </div>
            </div>
            <div className="flex flex-col text-right">
              <h3 className="text-[15px] font-black text-gray-900">علیرضا صادق زاده قوی فکر</h3>
              <p className="mt-0.5 text-[12px] font-bold text-gray-400 tracking-wider" dir="ltr">۰۹۲۱****۷۰۴</p>
            </div>
          </div>
          <i className="text-[20px] text-gray-300 ti ti-chevron-left"></i>
        </div>

        {/* ۲. بنر دعوت از دوستان جذاب با تم جایزه طلایی */}
        <div className="flex items-center justify-between p-4 bg-white rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-gray-50/50 active:scale-[0.99] transition-transform cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-11 h-11 text-emerald-700 bg-emerald-50/70 rounded-2xl border border-emerald-100/30">
              <i className="ti ti-gift text-[22px]"></i>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[13px] font-black text-gray-800">۲ سوت جایزه برای دعوت هر دوست</span>
              <span className="mt-0.5 text-[11px] font-bold text-gray-400">۱ سوت شما، ۱ سوت دوستان شما</span>
            </div>
          </div>
          <i className="text-[20px] text-emerald-600/70 ti ti-chevron-left"></i>
        </div>

        {/* ۳. لیست مجتمع منوها (گروه‌بندی شده مانند تصاویر آی‌اواس) */}
        <div className="flex flex-col bg-white rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-gray-50/50 overflow-hidden">
          <MenuItem icon="ti-history" title="تاریخچه سفارشات" />
          <MenuItem icon="ti-credit-card" title="حساب‌های بانکی" />
          <MenuItem icon="ti-lock" title="تغییر رمزعبور" />
          <MenuItem icon="ti-shield-check" title="مجوزهای آرکان گلد" />
          <MenuItem icon="ti-file-description" title="قوانین و مقررات" />
          <MenuItem icon="ti-help" title="سوالات متداول" />
          <MenuItem icon="ti-headset" title="پشتیبانی آنلاین" hasBorder={false} />
        </div>

        {/* ۴. دکمه خروج مینیمال پلتفرم */}
        <button 
          onClick={handleLogout}
          className="w-full py-4 font-black text-[14px] text-red-500 bg-white rounded-3xl shadow-[0_2px_8px_rgba(0,0,0,0.02)] border border-gray-50/50 active:bg-red-50/30 active:text-red-600 transition-colors"
        >
          خروج از حساب کاربری
        </button>
      </div>
    </div>
  );
}

// کامپوننت داخلی ردیف‌های منو جهت تمیزی کد
function MenuItem({ icon, title, hasBorder = true }: { icon: string, title: string, hasBorder?: boolean }) {
  return (
    <div className={`flex items-center justify-between p-4.5 cursor-pointer active:bg-gray-50/70 transition-colors ${hasBorder ? 'border-b border-gray-100/60' : ''}`}>
      <div className="flex items-center gap-3.5">
        <div className="text-gray-500">
          <i className={`ti ${icon} text-[22px]`}></i>
        </div>
        <span className="text-[13.5px] font-bold text-gray-800">{title}</span>
      </div>
      <i className="text-[18px] text-gray-300 ti ti-chevron-left"></i>
    </div>
  );
}