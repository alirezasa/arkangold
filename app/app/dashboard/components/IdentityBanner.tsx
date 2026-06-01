"use client";

import Link from "next/link";
import { AlertTriangle, Clock, ArrowLeft } from "lucide-react";

interface IdentityBannerProps {
  status?: 'VERIFIED' | 'MANUAL_REVIEW' | 'PENDING' | null;
}

export default function IdentityBanner({ status }: IdentityBannerProps) {
  // اگر کاربر احراز هویت شده باشد، بنر اصلا رندر نمی‌شود
  if (status === 'VERIFIED') {
    return null;
  }

  // بررسی وضعیت‌های در انتظار تایید
  const isPending = status === 'PENDING' || status === 'MANUAL_REVIEW';

  return (
    <div 
      className={`mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border ${
        isPending 
          ? "bg-blue-50 border-blue-200 text-blue-800" 
          : "bg-amber-50 border-amber-200 text-amber-800"
      }`}
    >
      <div className="flex items-center gap-3">
        <div 
          className={`p-2.5 rounded-xl shrink-0 ${
            isPending ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
          }`}
        >
          {isPending ? (
            <Clock className="w-5 h-5 animate-pulse" />
          ) : (
            <AlertTriangle className="w-5 h-5" />
          )}
        </div>
        <div>
          <h3 className="text-[14px] font-black mb-1">
            {isPending ? "احراز هویت در حال بررسی" : "نیاز به تکمیل احراز هویت"}
          </h3>
          <p className="text-[12px] opacity-80 font-medium leading-relaxed">
            {isPending 
              ? "مدارک شما دریافت شده و توسط کارشناسان ما در حال بررسی است. لطفاً شکیبا باشید."
              : "برای دسترسی به امکانات کامل از جمله خرید، فروش و برداشت طلا، احراز هویت خود را تکمیل کنید."
            }
          </p>
        </div>
      </div>
      
      <Link 
        href="/dashboard/identity"
        className={`w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-sm ${
          isPending
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-amber-500 text-white hover:bg-amber-600"
        }`}
      >
        <span>{isPending ? "مشاهده وضعیت" : "شروع احراز هویت"}</span>
        <ArrowLeft className="w-4 h-4" />
      </Link>
    </div>
  );
}