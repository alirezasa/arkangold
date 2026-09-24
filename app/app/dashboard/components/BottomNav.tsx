"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { IdentityStatus } from "@arkan-gold/shared";
import {
  BOTTOM_NAV,
  USER_MENU_GROUPS,
  getActiveNavPath,
  isIdentityFreePath,
} from "@/app/utils/mock-data";
import UserMenuSheet from "./UserMenuSheet";

const USER_MENU_KEY = "#user-menu";
const CENTER_PATH = "/dashboard/trade";

const USER_MENU_PATHS = USER_MENU_GROUPS.flatMap((g) =>
  g.items.map((i) => i.path),
);
const ALL_NAV_PATHS = [
  ...BOTTOM_NAV.map((i) => i.path).filter((p) => p !== USER_MENU_KEY),
  ...USER_MENU_PATHS,
  "/dashboard/identity",
];

interface BottomNavProps {
  identityStatus?: IdentityStatus | null;
  userName?: string;
  userPhone?: string;
  /** تا تایید احراز هویت، ناوبری (به‌جز منوی کاربری) قفل است */
  locked?: boolean;
}

export default function BottomNav({
  identityStatus,
  userName,
  userPhone,
  locked = false,
}: BottomNavProps) {
  const pathname = usePathname();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const activePath = getActiveNavPath(pathname, ALL_NAV_PATHS);
  // صفحات منوی کاربری (و احراز هویت) زیر تب «کاربری» فعال نمایش داده می‌شوند
  const isUserSectionActive =
    isUserMenuOpen ||
    (activePath !== null &&
      (USER_MENU_PATHS.includes(activePath) ||
        activePath === "/dashboard/identity"));

  return (
    <>
      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-[80] pointer-events-none px-3"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
      >
        <nav
          className="pointer-events-auto relative flex items-stretch rounded-[26px] px-1.5 py-1.5 backdrop-blur-xl shadow-[0_10px_32px_rgba(51,5,9,0.14)]"
          style={{
            background: "rgba(255,255,255,0.94)",
            border: "1px solid var(--color-border)",
          }}
          aria-label="منوی پایین"
        >
          {BOTTOM_NAV.map((item) => {
            const isUserMenu = item.path === USER_MENU_KEY;
            const isCenter = item.path === CENTER_PATH;
            const isActive = isUserMenu
              ? isUserSectionActive
              : !isUserMenuOpen && item.path === activePath;
            const isLocked =
              locked && !isUserMenu && !isIdentityFreePath(item.path);

            // ─── دکمه مرکزی خرید/فروش ───
            if (isCenter) {
              const centerInner = (
                <>
                  <span
                    className={`-mt-7 flex h-[56px] w-[56px] items-center justify-center rounded-[20px] shadow-[0_10px_22px_rgba(51,5,9,0.35)] ring-4 ring-bg-page transition-transform duration-300 ${
                      isLocked ? "opacity-60" : "group-active:scale-90"
                    }`}
                    style={{
                      background:
                        "linear-gradient(145deg, #5a0d15 0%, var(--color-emerald) 70%)",
                      color: "var(--color-gold-500)",
                    }}
                  >
                    <i
                      className={`ti ${isLocked ? "ti-lock" : item.icon} text-[26px]`}
                      aria-hidden="true"
                    />
                  </span>
                  <span
                    className="mt-1 text-[10px] font-black"
                    style={{
                      color: isActive
                        ? "var(--color-emerald)"
                        : "var(--color-text-secondary)",
                    }}
                  >
                    {item.name}
                  </span>
                </>
              );

              return isLocked ? (
                <span
                  key={item.path}
                  aria-disabled="true"
                  className="flex flex-1 flex-col items-center justify-end"
                >
                  {centerInner}
                </span>
              ) : (
                <Link
                  key={item.path}
                  href={item.path}
                  aria-current={isActive ? "page" : undefined}
                  className="group flex flex-1 flex-col items-center justify-end outline-none touch-manipulation"
                >
                  {centerInner}
                </Link>
              );
            }

            // ─── دکمه‌های معمولی ───
            const inner = (
              <span className="relative flex h-[52px] w-full flex-col items-center justify-center">
                <span
                  className={`absolute inset-x-1 inset-y-0 rounded-[18px] transition-all duration-300 ${
                    isActive ? "scale-100 opacity-100" : "scale-75 opacity-0"
                  }`}
                  style={{ background: "var(--color-gold-50)" }}
                  aria-hidden="true"
                />
                <span
                  className={`absolute top-0 h-[3px] w-5 rounded-full transition-all duration-300 ${
                    isActive ? "opacity-100" : "opacity-0"
                  }`}
                  style={{ background: "var(--color-gold-500)" }}
                  aria-hidden="true"
                />
                <span className="relative">
                  <i
                    className={`ti ${item.icon} text-[22px] transition-colors duration-300`}
                    style={{
                      color: isActive
                        ? "var(--color-emerald)"
                        : isLocked
                          ? "#d1d5db"
                          : "#9ca3af",
                    }}
                    aria-hidden="true"
                  />
                  {isLocked && (
                    <i
                      className="ti ti-lock absolute -bottom-1 -left-1.5 rounded-full bg-white text-[11px] text-gray-400"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <span
                  className={`relative mt-0.5 text-[10px] transition-colors duration-300 ${
                    isActive ? "font-black" : "font-bold"
                  }`}
                  style={{
                    color: isActive
                      ? "var(--color-emerald)"
                      : isLocked
                        ? "#d1d5db"
                        : "#9ca3af",
                  }}
                >
                  {item.name}
                </span>
              </span>
            );

            const itemClass =
              "relative flex flex-1 items-center outline-none touch-manipulation transition-transform active:scale-95";

            if (isUserMenu) {
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => setIsUserMenuOpen(true)}
                  className={itemClass}
                  aria-haspopup="dialog"
                  aria-expanded={isUserMenuOpen}
                >
                  {inner}
                </button>
              );
            }

            if (isLocked) {
              return (
                <span
                  key={item.path}
                  aria-disabled="true"
                  className="relative flex flex-1 items-center cursor-not-allowed"
                >
                  {inner}
                </span>
              );
            }

            return (
              <Link
                key={item.path}
                href={item.path}
                aria-current={isActive ? "page" : undefined}
                className={itemClass}
              >
                {inner}
              </Link>
            );
          })}
        </nav>
      </div>

      <UserMenuSheet
        isOpen={isUserMenuOpen}
        onClose={() => setIsUserMenuOpen(false)}
        identityStatus={identityStatus}
        userName={userName}
        userPhone={userPhone}
        locked={locked}
      />
    </>
  );
}
