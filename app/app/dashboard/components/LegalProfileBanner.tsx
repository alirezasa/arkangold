// app/app/dashboard/components/LegalProfileBanner.tsx
"use client";
import Link from "next/link";
import { Building2, ArrowLeft, Clock, XCircle } from "lucide-react";

export type LegalProfileBannerStatus =
  | "pending_approval"
  | "need_submit"
  | "rejected";

export default function LegalProfileBanner({
  status,
}: {
  status: LegalProfileBannerStatus;
}) {
  const config = {
    pending_approval: {
      bg: "#fffbeb",
      border: "#fcd34d",
      iconBg: "#fef3c7",
      iconColor: "#d97706",
      icon: Clock,
      title: "در انتظار تایید اطلاعات حقوقی",
      desc: "اطلاعات شرکت شما ثبت شده و در حال بررسی توسط کارشناسان است.",
    },
    need_submit: {
      bg: "#fefce8",
      border: "#fde68a",
      iconBg: "#fef9c3",
      iconColor: "#ca8a04",
      icon: Building2,
      title: "تکمیل پروفایل حقوقی",
      desc: "برای فعالیت به عنوان شخص حقوقی، ابتدا باید اطلاعات و مدارک ثبتی شرکت را تکمیل کنید.",
    },
    rejected: {
      bg: "#fef2f2",
      border: "#fecaca",
      iconBg: "#fee2e2",
      iconColor: "#dc2626",
      icon: XCircle,
      title: "درخواست حقوقی شما رد شد",
      desc: "لطفاً علت رد را مشاهده و اطلاعات را اصلاح کنید.",
    },
  }[status];

  const Icon = config.icon;

  return (
    <div
      className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border animate-in fade-in duration-300"
      style={{
        backgroundColor: config.bg,
        borderColor: config.border,
        color: "#422006",
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="p-2.5 rounded-xl shrink-0"
          style={{ backgroundColor: config.iconBg, color: config.iconColor }}
        >
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-[14px] font-black mb-1">{config.title}</h3>
          <p className="text-[12px] opacity-80 font-medium leading-relaxed">
            {config.desc}
          </p>
        </div>
      </div>
      <Link
        href="/dashboard/identity/legal"
        className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-sm hover:opacity-90"
        style={{
          backgroundColor:
            status === "rejected"
              ? "#dc2626"
              : status === "pending_approval"
                ? "#f59e0b"
                : "#16a34a",
          color: "#fff",
        }}
      >
        <span>
          {status === "rejected"
            ? "اصلاح اطلاعات"
            : status === "pending_approval"
              ? "مشاهده وضعیت"
              : "تکمیل اطلاعات شرکت"}
        </span>
        <ArrowLeft className="w-4 h-4" />
      </Link>
    </div>
  );
}
