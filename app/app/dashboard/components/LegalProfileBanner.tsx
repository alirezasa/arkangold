"use client";

import Link from "next/link";
import { Building2, ArrowLeft } from "lucide-react";

export default function LegalProfileBanner() {
  return (
    <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border bg-yellow-50 border-yellow-200 text-bg-primary-800 animate-in fade-in duration-300">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl shrink-0 bg-yellow-100 text-yellow-600">
          <Building2 className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-[14px] font-black mb-1">تکمیل پروفایل حقوقی</h3>
          <p className="text-[12px] opacity-80 font-medium leading-relaxed">
            برای فعالیت به عنوان شخص حقوقی و دسترسی به پنل شرکتی، ابتدا باید
            اطلاعات و مدارک ثبتی شرکت را تکمیل کنید.
          </p>
        </div>
      </div>

      <Link
        href="/dashboard/identity/legal"
        className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-sm bg-green-600 text-white! hover:bg-green-700"
      >
        <span>تکمیل اطلاعات شرکت</span>
        <ArrowLeft className="w-4 h-4" />
      </Link>
    </div>
  );
}
