"use client";

import NotificationBell from "./NotificationBell";

interface TopbarProps {
  onMenuOpen: () => void;
  pageTitle?: string;
}

export default function Topbar({
  onMenuOpen,
  pageTitle = "پیشخوان",
}: TopbarProps) {
  return (
    <header
      className="flex h-16 shrink-0 items-center justify-between px-4 sm:px-7"
      style={{
        backgroundColor: "var(--color-surface)",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {/* Hamburger (mobile) + page title */}
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuOpen}
          className="lg:hidden -mr-2 rounded-lg p-2 text-text-secondary transition-colors hover:bg-gray-100"
          aria-label="باز کردن منو"
        >
          <i className="ti ti-menu-2 text-[24px]" aria-hidden="true" />
        </button>
        <h2 className="hidden text-[18px] font-black text-text-primary sm:block">
          {pageTitle}{" "}
          <span style={{ color: "var(--color-gold-500)" }}>کاربری</span>
        </h2>
      </div>

      {/* Search + notification */}
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Search */}
        <div
          className="hidden md:flex items-center gap-2 w-48 rounded-[10px] px-3 py-1.75text-[13px]"
          style={{
            background: "var(--color-bg-page)",
            border: "1px solid var(--color-border)",
            color: "var(--color-text-secondary)",
          }}
        >
          <i className="ti ti-search text-[16px]" aria-hidden="true" />
          <span>جستجو...</span>
        </div>

        {/* اعلان‌ها (درج‌شده توسط ادمین) */}
        <NotificationBell variant="desktop" />
      </div>
    </header>
  );
}
