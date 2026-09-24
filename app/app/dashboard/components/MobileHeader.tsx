"use client";
import { IdentityStatus } from "@arkan-gold/shared";

interface MobileHeaderProps {
  userName?: string;
  notifCount?: number;
  identityStatus?: IdentityStatus | null;
}

function statusLabel(status: IdentityStatus | null | undefined) {
  switch (status) {
    case IdentityStatus.VERIFIED:
      return { text: "احراز هویت شده", className: "text-emerald-300" };
    case IdentityStatus.PENDING:
    case IdentityStatus.MANUAL_REVIEW:
      return { text: "در حال بررسی", className: "text-amber-300" };
    case IdentityStatus.REJECTED:
      return { text: "احراز رد شده", className: "text-red-300" };
    default:
      return { text: "احراز نشده", className: "text-amber-300" };
  }
}

export default function MobileHeader({
  userName = "",
  notifCount = 3,
  identityStatus,
}: MobileHeaderProps) {
  const status = statusLabel(identityStatus);

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

      <div
        className="relative flex items-center justify-between gap-3 px-5 pb-5"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}
      >
        <h1 className="shrink-0 text-[20px] font-black text-white">
          آرکان <span style={{ color: "var(--color-gold-500)" }}>گلد</span>
        </h1>

        <div className="flex min-w-0 items-center gap-2.5">
          {/* دکمه اعلان‌ها */}
          <button
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-white/90 transition-colors active:bg-white/20"
            style={{ background: "rgba(255,255,255,.15)" }}
            aria-label={`${notifCount} اعلان`}
          >
            <i className="ti ti-bell text-[18px]" aria-hidden="true" />
            {notifCount > 0 && (
              <span
                className="absolute right-1 top-1 h-2 w-2 rounded-full border-2"
                style={{
                  background: "var(--color-red)",
                  borderColor: "var(--color-emerald)",
                }}
                aria-hidden="true"
              />
            )}
          </button>

          {/* نام و نام خانوادگی کاربر و وضعیت احراز */}
          <div className="flex min-w-0 items-center gap-2 border-r border-white/10 pr-2.5">
            <div className="flex min-w-0 flex-col items-end">
              <span className="max-w-[140px] truncate text-[12px] font-bold text-white">
                {userName}
              </span>
              <span className={`text-[10px] font-medium ${status.className}`}>
                {status.text}
              </span>
            </div>
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-black shadow-sm"
              style={{
                background: "var(--color-gold-500)",
                color: "var(--color-emerald)",
              }}
            >
              {userName.charAt(0) || (
                <i className="ti ti-user text-[16px]" aria-hidden="true" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
