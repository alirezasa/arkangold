"use client";

interface TopbarProps {
  onMenuOpen: () => void;
  pageTitle?: string;
  notifCount?: number;
}

export default function Topbar({
  onMenuOpen,
  pageTitle = "پیشخوان",
  notifCount = 3,
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

        {/* Notification bell */}
        <button
          className="relative flex h-9.5 w-9.5ems-center justify-center rounded-[10px] text-text-secondary transition-all duration-200 hover:border-emerald hover:text-emerald"
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
          aria-label={`${notifCount} اعلان جدید`}
        >
          <i className="ti ti-bell text-[18px]" aria-hidden="true" />
          {notifCount > 0 && (
            <span
              className="absolute right-1.5op-[6px] h-2 w-2 rounded-full border-2"
              style={{
                background: "var(--color-red)",
                borderColor: "var(--color-surface)",
              }}
              aria-hidden="true"
            />
          )}
        </button>
      </div>
    </header>
  );
}
