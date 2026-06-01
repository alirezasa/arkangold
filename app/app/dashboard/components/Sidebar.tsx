"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { SIDEBAR_NAV, SIDEBAR_ACCOUNT_NAV } from "@/app/utils/mock-data";
import { ShieldCheck, ShieldAlert } from "lucide-react";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userPhone?: string;
  identityStatus?: "VERIFIED" | "MANUAL_REVIEW" | "PENDING" | null;
}

export default function Sidebar({
  isOpen,
  onClose,
  userName = "کاربر گرامی",
  userPhone = "...",
  identityStatus = null,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
    } catch {
      console.error("خطا در خروج");
    }
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          "fixed lg:static top-0 right-0 h-full z-50",
          "flex flex-col transition-transform duration-300",
          "w-65 min-w-65",
          isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        ].join(" ")}
        style={{
          backgroundColor: "var(--color-emerald)",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.1)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -left-16 w-56 h-56 rounded-full opacity-[0.08]"
          style={{ background: "var(--color-gold-500)" }}
        />

        <div className="relative px-6 pt-6 pb-5 border-b border-white/10">
          <h1 className="text-[22px] font-black text-white leading-tight">
            آرکان <span style={{ color: "var(--color-gold-500)" }}>گلد</span>
          </h1>
          <p className="mt-1 text-[11px] font-medium text-white/70">
            پلتفرم طلای آب‌شده
          </p>
        </div>

        <div
          className="relative mx-4 my-4 rounded-xl p-3"
          style={{
            background: "rgba(197,160,89,.15)",
            border: "1px solid rgba(197,160,89,.3)",
          }}
        >
          <p className="text-[10px] text-white/80 mb-1">قیمت لحظه‌ای طلا</p>
          <p
            className="text-[18px] font-black"
            style={{ color: "var(--color-gold-500)" }}
          >
            ۴,۲۸۰,۰۰۰ ت
          </p>
          <p className="mt-1 text-[11px] text-emerald-300 font-bold">
            ↑ ۱.۲٪ امروز
          </p>
        </div>

        <nav className="relative flex-1 overflow-y-auto px-3 py-2 space-y-1">
          {SIDEBAR_NAV.map((item) => {
            const active = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onClose}
                className={[
                  "flex items-center gap-3 px-3 py-2.75 rounded-xl",
                  "text-[13px] font-bold transition-all duration-200",
                  active
                    ? "text-white! shadow-md font-black"
                    : "text-white! hover:bg-white/8",
                ].join(" ")}
                style={
                  active
                    ? { backgroundColor: "var(--color-gold-500)" }
                    : undefined
                }
              >
                <i
                  className={`ti ${item.icon} w-5 text-center text-[19px] shrink-0`}
                  aria-hidden="true"
                />
                <span>{item.name}</span>
                {item.badge ? (
                  <span className="mr-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}

          {SIDEBAR_ACCOUNT_NAV.map((item) => {
            const active = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={onClose}
                className={[
                  "flex items-center gap-3 px-3 py-2.75 rounded-xl",
                  "text-[13px] font-bold transition-all duration-200",
                  active
                    ? "text-white! shadow-md font-black"
                    : "text-white! hover:bg-white/8",
                ].join(" ")}
                style={
                  active
                    ? { backgroundColor: "var(--color-gold-500)" }
                    : undefined
                }
              >
                <i
                  className={`ti ${item.icon} w-5 text-center text-[19px] shrink-0`}
                  aria-hidden="true"
                />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="relative p-3 border-t border-white/10">
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: "rgba(255,255,255,.09)" }}
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[14px] font-black"
              style={{
                background: "var(--color-gold-500)",
                color: "var(--color-emerald)",
              }}
            >
              {userName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <p className="truncate text-[12px] font-bold text-white">
                  {userName}
                </p>
                {identityStatus === "VERIFIED" ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-green-400 shrink-0" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                )}
              </div>
              <p
                className="text-[11px] text-white/60 font-medium truncate"
                dir="ltr"
                style={{ textAlign: "right" }}
              >
                {userPhone}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="rounded-md p-1.5 text-white/60 transition-all duration-200 hover:bg-red-500/20 hover:text-red-300"
              aria-label="خروج از حساب"
            >
              <i className="ti ti-logout text-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
