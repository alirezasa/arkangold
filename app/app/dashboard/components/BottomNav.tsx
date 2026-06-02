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
      {/* نگهدارنده اصلی با فاصله از پایین و طرفین */}
      <div className="lg:hidden fixed bottom-5 left-4 right-4 z-[80] pointer-events-none pb-safe">
        <nav
          className="pointer-events-auto flex items-center justify-between px-2 py-2 rounded-3xl bg-white/85 backdrop-blur-xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
          aria-label="منوی پایین"
        >
          {BOTTOM_NAV.map((item) => {
            const isCenter = item.icon === "ti-plus";
            const isProfileButton = item.path === "/dashboard/profile";
            const isActive = pathname === item.path || (isProfileButton && isProfileOpen);

            // ─── ۱. دکمه مرکزی (اکشن اصلی) ───
            if (isCenter) {
              return (
                <div key={item.path} className="relative flex justify-center px-1">
                  <div className="absolute bottom-1">
                    <Link
                      href={item.path}
                      className="flex items-center justify-center w-[54px] h-[54px] rounded-2xl bg-gradient-to-tr from-[#064e3b] to-emerald-600 text-white shadow-[0_8px_20px_rgba(6,78,59,0.3)] active:scale-90 transition-transform duration-300"
                    >
                      <i className={`ti ${item.icon} text-[28px]`} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              );
            }

            // ─── ۲. ساختار دکمه‌های معمولی ───
            const ButtonContent = (
              <div className="relative flex flex-col items-center justify-center w-full h-[54px]">
                {/* بک‌گراند فعال (Pill) که فقط در حالت فعال ظاهر می‌شود */}
                <div 
                  className={`absolute inset-0 rounded-2xl transition-all duration-300 ${
                    isActive ? "bg-emerald-50/80 scale-100 opacity-100" : "scale-50 opacity-0"
                  }`} 
                />

                <div className="relative flex flex-col items-center justify-center z-10 transition-transform duration-300">
                  {/* آیکون */}
                  <div className="relative">
                    <i 
                      className={`ti ${item.icon} text-[22px] transition-all duration-300 ${
                        isActive ? "text-[#064e3b] -translate-y-0.5" : "text-gray-400"
                      }`} 
                    />
                    
                    {/* بج نوتیفیکیشن */}
                    {item.badge ? (
                      <span className="absolute -top-1 -right-2 flex items-center justify-center w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full border-2 border-white shadow-sm">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>

                  {/* متن (فقط در حالت فعال کمی پررنگ‌تر می‌شود) */}
                  <span
                    className={`text-[10px] font-bold mt-0.5 transition-all duration-300 ${
                      isActive ? "text-[#064e3b] translate-y-0 opacity-100" : "text-gray-400 translate-y-1 opacity-70"
                    }`}
                  >
                    {item.name}
                  </span>
                </div>
              </div>
            );

            // ─── ۳. دکمه پروفایل (باز کردن مودال) ───
            if (isProfileButton) {
              return (
                <button
                  key={item.path}
                  onClick={() => setIsProfileOpen(true)}
                  className="relative flex-1 h-full active:scale-95 transition-transform outline-none touch-manipulation"
                >
                  {ButtonContent}
                </button>
              );
            }

            // ─── ۴. لینک‌های ناوبری ───
            return (
              <Link
                key={item.path}
                href={item.path}
                className="relative flex-1 h-full active:scale-95 transition-transform outline-none touch-manipulation"
              >
                {ButtonContent}
              </Link>
            );
          })}
        </nav>
      </div>

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