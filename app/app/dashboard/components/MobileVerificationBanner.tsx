"use client";

import Link from "next/link";
import { ArrowLeft, Smartphone } from "lucide-react";

/** بنر عدم تطابق شاهکار — روی صفحاتی که در حالت مسدود باز می‌مانند (مثل پشتیبانی) */
export default function MobileVerificationBanner() {
  return (
    <div className="mb-6 flex flex-col items-start justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800 sm:flex-row sm:items-center">
      <div className="flex items-center gap-3">
        <div className="shrink-0 rounded-xl bg-rose-100 p-2.5 text-rose-600">
          <Smartphone className="h-5 w-5" />
        </div>
        <div>
          <h3 className="mb-1 text-[14px] font-black">
            شماره موبایل شما به نام خودتان نیست
          </h3>
          <p className="text-[12px] font-medium leading-relaxed opacity-80">
            طبق سامانه شاهکار، سیم‌کارت فعلی به نام کد ملی شما ثبت نشده است. برای
            استفاده از خدمات، شماره‌ای که به نام خودتان است ثبت کنید.
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/identity/mobile"
        className="flex w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-[12px] font-bold text-white shadow-sm transition-all hover:bg-rose-700 active:scale-95 sm:w-auto"
      >
        <span>ثبت شماره به نام خودم</span>
        <ArrowLeft className="h-4 w-4" />
      </Link>
    </div>
  );
}
