"use client";
import { IdentityStatus } from "@arkan-gold/shared"; // این خط اضافه شود
interface MobileHeaderProps {
  userName?: string;
  notifCount?: number;
  identityStatus?: IdentityStatus | null;
}

export default function MobileHeader({
  userName = "کاربر گرامی",
  notifCount = 3,
  identityStatus,
}: MobileHeaderProps) {
  return (
    <div
      className="lg:hidden relative overflow-hidden shrink-0 rounded-b-[24px] shadow-sm z-10"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      {/* پترن پس‌زمینه تزئینی */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-12 -right-8 h-32 w-32 rounded-full"
        style={{ background: "rgba(197,160,89,.12)" }}
      />

      <div className="relative flex items-center justify-between px-5 pt-4 pb-5">
        <h1 className="text-[20px] font-black text-white">
          آرکان <span style={{ color: "var(--color-gold-500)" }}>گلد</span>
        </h1>

        <div className="flex items-center gap-2.5">
          {/* دکمه جستجو */}
          <button
            className="flex h-9 w-9 items-center justify-center rounded-[12px] text-white/90 transition-colors active:bg-white/20"
            style={{ background: "rgba(255,255,255,.15)" }}
            aria-label="جستجو"
          >
            <i className="ti ti-search text-[18px]" aria-hidden="true" />
          </button>

          {/* دکمه اعلان‌ها */}
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-[12px] text-white/90 transition-colors active:bg-white/20"
            style={{ background: "rgba(255,255,255,.15)" }}
            aria-label={`${notifCount} اعلان`}
          >
            <i className="ti ti-bell text-[18px]" aria-hidden="true" />
            {notifCount > 0 && (
              <span
                className="absolute right-1 top-1 h-2 w-2 rounded-full border-2 border-[#064e3b]"
                style={{ background: "var(--color-red)" }}
                aria-hidden="true"
              />
            )}
          </button>

          {/* اطلاعات کاربر و وضعیت احراز */}
          <div className="flex items-center gap-2 mr-1 pl-1 border-r border-white/10">
            <div className="flex flex-col items-end">
              <span className="text-white text-[12px] font-bold">
                {userName}
              </span>
              {identityStatus === "VERIFIED" ? (
                <span className="text-[10px] text-emerald-300 font-medium">
                  تایید شده
                </span>
              ) : (
                <span className="text-[10px] text-amber-300 font-medium">
                  تایید نشده
                </span>
              )}
            </div>
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-black shadow-sm"
              style={{
                background: "var(--color-gold-500)",
                color: "var(--color-emerald)",
              }}
            >
              {userName.charAt(0)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
