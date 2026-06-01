"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
// فرض می‌کنیم آرایه BOTTOM_NAV از utils/mock-data می‌آید.
import { BOTTOM_NAV } from "@/app/utils/mock-data";
import MobileProfile from "./MobileProfile";

interface BottomNavProps {
  identityStatus?: "VERIFIED" | "MANUAL_REVIEW" | "PENDING" | null;
  userName?: string;
  userPhone?: string;
}

export default function BottomNav({
  identityStatus,
  userName,
  userPhone,
}: BottomNavProps) {
  const pathname = usePathname();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-[80] flex items-center justify-between px-2 bg-white/90 backdrop-blur-md border-t border-gray-100"
        style={{
          height: "76px",
          paddingBottom: "env(safe-area-inset-bottom)",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label="منوی پایین"
      >
        {BOTTOM_NAV.map((item) => {
          const isCenter = item.icon === "ti-plus";
          const isProfileButton = item.path === "/dashboard/profile";
          const isActive =
            pathname === item.path || (isProfileButton && isProfileOpen);

          // استایل دکمه‌های معمولی (زمانی که فعال هستند تغییر ظاهر می‌دهند)
          const ButtonContent = (
            <div
              className={`flex flex-col items-center justify-center w-full transition-all duration-300 ${isActive ? "-translate-y-1" : ""}`}
            >
              <div
                className={`relative flex items-center justify-center w-[44px] h-[32px] rounded-2xl transition-colors duration-300 ${
                  isActive ? "bg-[#064e3b]/15 text-[#064e3b]" : "text-gray-400"
                }`}
              >
                <i
                  className={`ti ${item.icon} text-[24px] ${isActive ? "font-black" : ""}`}
                />
                {item.badge ? (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full border-2 border-white">
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

              {/* نقطه کوچک زیر منوی فعال */}
              {isActive && (
                <div className="absolute -bottom-2 w-1.5 h-1.5 bg-[#064e3b] rounded-full animate-in fade-in zoom-in" />
              )}
            </div>
          );

          // دکمه پلاس مرکزی (متمایز)
          if (isCenter) {
            return (
              <div
                key={item.path}
                className="relative flex justify-center w-[20%]"
              >
                <div className="absolute -top-9">
                  <Link
                    href={item.path}
                    className="flex flex-col items-center justify-center w-[60px] h-[60px] rounded-[20px] bg-gradient-to-tr from-[#064e3b] to-[#047857] text-white shadow-lg shadow-emerald-900/30 active:scale-90 transition-transform rotate-45"
                  >
                    <div className="-rotate-45 flex flex-col items-center">
                      <i
                        className={`ti ${item.icon} text-[28px]`}
                        aria-hidden="true"
                      />
                    </div>
                  </Link>
                </div>
              </div>
            );
          }

          if (isProfileButton) {
            return (
              <button
                key={item.path}
                onClick={() => setIsProfileOpen(true)}
                className="relative flex flex-col items-center justify-center w-[20%] h-full active:bg-transparent outline-none"
              >
                {ButtonContent}
              </button>
            );
          }

          return (
            <Link
              key={item.path}
              href={item.path}
              className="relative flex flex-col items-center justify-center w-[20%] h-full active:bg-transparent outline-none"
            >
              {ButtonContent}
            </Link>
          );
        })}
      </nav>

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
