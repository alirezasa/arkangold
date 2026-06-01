"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BOTTOM_NAV } from "@/app/utils/mock-data";
import MobileProfile from "./MobileProfile";

interface BottomNavProps {
  identityStatus?: 'VERIFIED' | 'MANUAL_REVIEW' | 'PENDING' | null;
  userName?: string;
  userPhone?: string;
}

export default function BottomNav({ identityStatus, userName, userPhone }: BottomNavProps) {
  const pathname = usePathname();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-[80] flex items-center justify-around bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.06)] border-t border-gray-100"
        style={{
          height: "72px",
          paddingBottom: "env(safe-area-inset-bottom)",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label="منوی پایین"
      >
        {BOTTOM_NAV.map((item) => {
          const isCenter = item.icon === "ti-plus";
          const isProfileButton = item.path === "/dashboard/profile";
          const isActive = pathname === item.path || (isProfileButton && isProfileOpen);

          // ساختار داخلی دکمه‌ها
          const ButtonContent = (
            <div className="flex flex-col items-center justify-center w-full h-full pt-1">
              <div
                className={`relative flex items-center justify-center w-[48px] h-[32px] rounded-full transition-all duration-300 ${
                  isActive ? "bg-[#064e3b]/10 text-[#064e3b]" : "text-gray-400"
                }`}
              >
                <i className={`ti ${item.icon} text-[22px] transition-transform ${isActive ? "scale-110" : ""}`} />
                {item.badge ? (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white">
                    {item.badge}
                  </span>
                ) : null}
              </div>
              <span
                className={`text-[10px] font-bold mt-1 transition-colors ${
                  isActive ? "text-[#064e3b]" : "text-gray-400"
                }`}
              >
                {item.name}
              </span>
            </div>
          );

          // ۱. دکمه مرکزی (مثلاً دکمه خرید/فروش سریع یا مثبت)
          if (isCenter) {
            return (
              <div key={item.path} className="relative flex justify-center w-[20%]">
                <div className="absolute -top-8">
                  <Link
                    href={item.path}
                    className="flex flex-col items-center justify-center w-[58px] h-[58px] rounded-full bg-[#064e3b] text-white shadow-[0_8px_20px_rgba(6,78,59,0.35)] active:scale-95 transition-transform"
                  >
                    <i className={`ti ${item.icon} text-[26px] mb-0.5`} aria-hidden="true" />
                    <span className="text-[10px] font-black">{item.name}</span>
                  </Link>
                </div>
              </div>
            );
          }

          // ۲. دکمه پروفایل که منوی کشویی را باز می‌کند
          if (isProfileButton) {
            return (
              <button
                key={item.path}
                onClick={() => setIsProfileOpen(true)}
                className="flex w-[20%] h-full active:bg-gray-50/50 transition-colors border-none bg-transparent p-0 outline-none"
              >
                {ButtonContent}
              </button>
            );
          }

          // ۳. لینک‌های معمولی ناوبری
          return (
            <Link
              key={item.path}
              href={item.path}
              className="flex w-[20%] h-full active:bg-gray-50/50 transition-colors"
            >
              {ButtonContent}
            </Link>
          );
        })}
      </nav>

      {/* اتصال کامل اطلاعات لایوت به کامپوننت پروفایل موبایل */}
      <MobileProfile
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        identityStatus={identityStatus}
        userName={userName}
        userPhone={userPhone}
      />
    </>
  );
}