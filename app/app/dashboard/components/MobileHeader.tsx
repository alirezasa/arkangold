"use client";

import { GOLD_PRICES } from "@/app/utils/mock-data";

interface MobileHeaderProps {
  userName?: string;
  goldGrams?: string;
  goldValue?: string;
  notifCount?: number;
  identityStatus?: "VERIFIED" | "MANUAL_REVIEW" | "PENDING" | null;
}

export default function MobileHeader({
  userName = "کاربر گرامی",
  goldGrams = "۱۲.۵۴",
  goldValue = "۵۳,۷۱۱,۲۰۰",
  notifCount = 3,
  identityStatus,
}: MobileHeaderProps) {
  return (
    <div
      className="lg:hidden relative overflow-hidden shrink-0"
      style={{ backgroundColor: "var(--color-emerald)" }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full"
        style={{ background: "rgba(197,160,89,.12)" }}
      />

      <div className="relative flex items-center justify-between px-4 pt-4 pb-4">
        <h1 className="text-[18px] font-black text-white">
          آرکان <span style={{ color: "var(--color-gold-500)" }}>گلد</span>
        </h1>
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-[10px] text-white/80"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label="جستجو"
          >
            <i className="ti ti-search text-[18px]" aria-hidden="true" />
          </button>
          <button
            className="relative flex h-9 w-9 items-center justify-center rounded-[10px] text-white/80"
            style={{ background: "rgba(255,255,255,.12)" }}
            aria-label={`${notifCount} اعلان`}
          >
            <i className="ti ti-bell text-[18px]" aria-hidden="true" />
            {notifCount > 0 && (
              <span
                className="absolute right-1.25 top-1.25 h-1.75 w-1.75 rounded-full border-[1.5px]"
                style={{
                  background: "var(--color-red)",
                  borderColor: "var(--color-emerald)",
                }}
                aria-hidden="true"
              />
            )}
          </button>

          {/* نمایش کاربر و وضعیت احراز هویت */}
          <div className="flex flex-col items-end mr-1">
            <span className="text-white text-[11px] font-bold">{userName}</span>
            {identityStatus === "VERIFIED" ? (
              <span className="text-[9px] text-green-300 font-medium">
                تایید شده
              </span>
            ) : (
              <span className="text-[9px] text-amber-300 font-medium">
                تایید نشده
              </span>
            )}
          </div>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-black"
            style={{
              background: "var(--color-gold-500)",
              color: "var(--color-emerald)",
            }}
          >
            {userName.charAt(0)}
          </div>
        </div>
      </div>

      <div
        className="relative mx-4 mb-4 rounded-[14px] p-4"
        style={{
          background: "rgba(255,255,255,.1)",
          border: "1px solid rgba(255,255,255,.15)",
        }}
      >
        <p className="text-[10px] text-white/60 mb-1">موجودی طلا</p>
        <p className="text-[26px] font-black text-white leading-tight">
          {goldGrams} گرم
        </p>
        <p
          className="mt-1 text-[12px]"
          style={{ color: "var(--color-gold-500)" }}
        >
          ارزش: {goldValue} تومان
        </p>

        <div className="mt-3 flex gap-2">
          {[
            { label: "خرید طلا", primary: true },
            { label: "فروش طلا", primary: false },
            { label: "واریز", primary: false },
          ].map((btn) => (
            <button
              key={btn.label}
              className="flex-1 rounded-[9px] py-2.25 text-[12px] font-bold transition-opacity hover:opacity-90 active:scale-[.98]"
              style={
                btn.primary
                  ? {
                      background: "var(--color-gold-500)",
                      color: "var(--color-emerald)",
                      border: "none",
                    }
                  : {
                      background: "rgba(255,255,255,.15)",
                      color: "#fff",
                      border: "none",
                    }
              }
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className="mx-4 mb-4 rounded-xl p-3"
        style={{
          background: "rgba(255,255,255,.07)",
          border: "1px solid rgba(255,255,255,.1)",
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[13px] font-bold text-white">قیمت لحظه‌ای</p>
          <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.75 text-[10px] font-bold text-green-700">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-green-500" />
            زنده
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GOLD_PRICES.map((g) => (
            <div
              key={g.type}
              className="rounded-lg p-2 text-center"
              style={{ background: "rgba(255,255,255,.08)" }}
            >
              <p className="text-[10px] text-white/60 mb-1">{g.type}</p>
              <p className="text-[13px] font-black text-white">
                {(g.price / 1_000_000).toFixed(2)}م
              </p>
              <p className="mt-0.5 text-[10px] text-green-400">+{g.change}٪</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
