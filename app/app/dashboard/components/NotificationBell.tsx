"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  useNotifications,
  type NotificationItem,
  type NotificationLevel,
} from "@/app/hooks/useNotifications";

const LEVEL_STYLE: Record<
  NotificationLevel,
  { icon: string; bg: string; color: string }
> = {
  INFO: { icon: "ti-info-circle", bg: "#dbeafe", color: "#1d4ed8" },
  SUCCESS: { icon: "ti-circle-check", bg: "#dcfce7", color: "#15803d" },
  WARNING: { icon: "ti-alert-triangle", bg: "#fef3c7", color: "#b45309" },
  PROMO: { icon: "ti-sparkles", bg: "var(--color-gold-50)", color: "#8c703b" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "همین الان";
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours.toLocaleString("fa-IR")} ساعت پیش`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days.toLocaleString("fa-IR")} روز پیش`;
  return new Date(iso).toLocaleDateString("fa-IR");
}

interface NotificationBellProps {
  /** mobile: دکمه روی هدر زرشکی موبایل — desktop: دکمه نوار بالای دسکتاپ */
  variant: "mobile" | "desktop";
}

export default function NotificationBell({ variant }: NotificationBellProps) {
  const router = useRouter();
  const { items, unreadCount, loading, error, markRead, markAllRead } =
    useNotifications();
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // بستن با کلیک بیرون از پنل یا کلید Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      )
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleItemClick = (item: NotificationItem) => {
    if (!item.readAt) void markRead(item.id);
    if (item.link) {
      setOpen(false);
      if (item.link.startsWith("/")) router.push(item.link);
      else window.open(item.link, "_blank", "noopener,noreferrer");
      return;
    }
    setExpandedId((id) => (id === item.id ? null : item.id));
  };

  const badge =
    unreadCount > 0 ? (unreadCount > 9 ? "۹+" : unreadCount.toLocaleString("fa-IR")) : null;

  const panel = (
        <div
          ref={panelRef}
          className={`z-[90] flex max-h-[70vh] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_16px_40px_rgba(51,5,9,0.18)] ${
            variant === "mobile"
              ? "fixed inset-x-3 top-[76px]"
              : "absolute left-0 top-12 w-[380px]"
          }`}
          style={{ border: "1px solid var(--color-border)" }}
          role="dialog"
          aria-label="اعلان‌ها"
          dir="rtl"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-[14px] font-black" style={{ color: "var(--color-emerald)" }}>
              اعلان‌ها
              {unreadCount > 0 && (
                <span className="mr-1.5 text-[11px] font-bold text-gray-400">
                  ({unreadCount.toLocaleString("fa-IR")} خوانده‌نشده)
                </span>
              )}
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-[11px] font-bold text-gold-600 hover:underline"
              >
                خواندن همه
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading ? (
              <div className="flex justify-center py-10">
                <i className="ti ti-loader-2 animate-spin text-[22px] text-gray-300" aria-hidden="true" />
              </div>
            ) : error ? (
              <p className="py-10 text-center text-[12px] font-bold text-red-500">{error}</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <i className="ti ti-bell-off text-[28px] text-gray-200" aria-hidden="true" />
                <p className="text-[12px] text-gray-400">اعلان جدیدی ندارید</p>
              </div>
            ) : (
              items.map((item, idx) => {
                const style = LEVEL_STYLE[item.level] ?? LEVEL_STYLE.INFO;
                const expanded = expandedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`flex w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-gray-50 ${
                      idx > 0 ? "border-t border-gray-100" : ""
                    } ${item.readAt ? "" : "bg-[#fdfbf4]"}`}
                  >
                    <span
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: style.bg, color: style.color }}
                    >
                      <i className={`ti ${style.icon} text-[18px]`} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`flex-1 truncate text-[13px] ${item.readAt ? "font-bold text-gray-700" : "font-black text-gray-900"}`}
                        >
                          {item.title}
                        </span>
                        {!item.readAt && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: "var(--color-gold-500)" }}
                            aria-label="خوانده‌نشده"
                          />
                        )}
                      </span>
                      <span
                        className={`mt-0.5 block whitespace-pre-line text-[12px] leading-relaxed text-gray-500 ${
                          expanded ? "" : "line-clamp-2"
                        }`}
                      >
                        {item.body}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                        {timeAgo(item.publishedAt)}
                        {item.link && (
                          <span className="flex items-center gap-0.5 font-bold text-gold-600">
                            مشاهده
                            <i className="ti ti-chevron-left text-[11px]" aria-hidden="true" />
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
  );

  return (
    <div ref={containerRef} className={variant === "desktop" ? "relative" : ""}>
      {variant === "mobile" ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] text-white/90 transition-colors active:bg-white/20"
          style={{ background: "rgba(255,255,255,.15)" }}
          aria-label={unreadCount ? `${unreadCount} اعلان خوانده‌نشده` : "اعلان‌ها"}
          aria-expanded={open}
        >
          <i className="ti ti-bell text-[18px]" aria-hidden="true" />
          {badge && (
            <span
              className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 px-1 text-[9px] font-black text-white"
              style={{ background: "var(--color-red)", borderColor: "var(--color-emerald)" }}
            >
              {badge}
            </span>
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative flex h-9.5 w-9.5 items-center justify-center rounded-[10px] text-text-secondary transition-all duration-200 hover:border-emerald hover:text-emerald"
          style={{
            border: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
          aria-label={unreadCount ? `${unreadCount} اعلان خوانده‌نشده` : "اعلان‌ها"}
          aria-expanded={open}
        >
          <i className="ti ti-bell text-[18px]" aria-hidden="true" />
          {badge && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 px-1 text-[9px] font-black text-white"
              style={{ background: "var(--color-red)", borderColor: "var(--color-surface)" }}
            >
              {badge}
            </span>
          )}
        </button>
      )}

      {open &&
        (variant === "mobile"
          ? // هدر موبایل stacking context جدا (z-10) دارد؛ پنل در body رندر می‌شود تا زیر محتوای صفحه نرود
            createPortal(panel, document.body)
          : panel)}
    </div>
  );
}
