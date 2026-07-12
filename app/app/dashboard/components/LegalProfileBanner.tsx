"use client";

import Link from "next/link";
import { Building2, ArrowLeft, Clock } from "lucide-react";

export type LegalProfileBannerStatus = "pending_approval" | "need_submit";

interface LegalProfileBannerProps {
  status: LegalProfileBannerStatus;
}

export default function LegalProfileBanner({
  status,
}: LegalProfileBannerProps) {
  const isPending = status === "pending_approval";

  return (
    <div
      className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border animate-in fade-in duration-300"
      style={{
        backgroundColor: isPending ? "#fffbeb" : "#fefce8",
        borderColor: isPending ? "#fcd34d" : "#fde68a",
        color: "#422006",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2.5 rounded-xl shrink-0"
          style={{
            backgroundColor: isPending ? "#fef3c7" : "#fef9c3",
            color: isPending ? "#d97706" : "#ca8a04",
          }}
        >
          {isPending ? (
            <Clock className="w-5 h-5" />
          ) : (
            <Building2 className="w-5 h-5" />
          )}
        </div>

        <div>
          <h3 className="text-[14px] font-black mb-1">
            {isPending
              ? "در انتظار تایید اطلاعات حقوقی"
              : "تکمیل پروفایل حقوقی"}
          </h3>

          <p className="text-[12px] opacity-80 font-medium leading-relaxed">
            {isPending
              ? "اطلاعات شرکت شما ثبت شده و در حال بررسی توسط کارشناسان است. پس از تایید، دسترسی کامل به پنل شرکتی برای شما فعال می‌شود."
              : "برای فعالیت به عنوان شخص حقوقی و دسترسی به پنل شرکتی، ابتدا باید اطلاعات و مدارک ثبتی شرکت را تکمیل کنید."}
          </p>
        </div>
      </div>

      <Link
        href="/dashboard/identity/legal"
        className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-sm hover:opacity-90"
        style={{
          backgroundColor: isPending ? "#f59e0b" : "#16a34a",
          color: "#fff",
        }}
      >
        <span>{isPending ? "مشاهده وضعیت" : "تکمیل اطلاعات شرکت"}</span>
        <ArrowLeft className="w-4 h-4" />
      </Link>
    </div>
  );
}
