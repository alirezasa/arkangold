"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { IdentityStatus } from "@arkan-gold/shared";
import {
  USER_MENU_GROUPS,
  getActiveNavPath,
  isIdentityFreePath,
} from "@/app/utils/mock-data";

const USER_MENU_PATHS = USER_MENU_GROUPS.flatMap((g) =>
  g.items.map((i) => i.path),
);

interface UserMenuSheetProps {
  isOpen: boolean;
  onClose: () => void;
  userName?: string;
  userPhone?: string;
  identityStatus?: IdentityStatus | null;
  /** تا تایید احراز هویت، آیتم‌ها (به‌جز پشتیبانی) قفل هستند */
  locked?: boolean;
}

function identityStatusInfo(status: IdentityStatus | null | undefined) {
  switch (status) {
    case IdentityStatus.VERIFIED:
      return {
        label: "احراز هویت شده",
        icon: "ti-rosette-discount-check",
        chip: "bg-emerald-400/15 text-emerald-200 border-emerald-300/30",
      };
    case IdentityStatus.PENDING:
    case IdentityStatus.MANUAL_REVIEW:
      return {
        label: "احراز هویت در حال بررسی",
        icon: "ti-clock",
        chip: "bg-amber-400/15 text-amber-200 border-amber-300/30",
      };
    case IdentityStatus.REJECTED:
      return {
        label: "احراز هویت رد شده",
        icon: "ti-alert-triangle",
        chip: "bg-red-400/15 text-red-200 border-red-300/30",
      };
    default:
      return {
        label: "احراز هویت نشده",
        icon: "ti-shield-x",
        chip: "bg-red-400/15 text-red-200 border-red-300/30",
      };
  }
}

export default function UserMenuSheet({
  isOpen,
  onClose,
  userName = "",
  userPhone = "",
  identityStatus = null,
  locked = false,
}: UserMenuSheetProps) {
  const router = useRouter();
  const pathname = usePathname();
  const activePath = getActiveNavPath(pathname, USER_MENU_PATHS);

  // قفل اسکرول صفحه پشت منو + بستن با کلید Escape
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      onClose();
      router.replace("/login");
    } catch {
      console.error("خطا در خروج");
    }
  };

  if (!isOpen) return null;

  const status = identityStatusInfo(identityStatus);
  const isVerified = identityStatus === IdentityStatus.VERIFIED;
  const isPending =
    identityStatus === IdentityStatus.PENDING ||
    identityStatus === IdentityStatus.MANUAL_REVIEW;

  return (
    <div
      className="fixed inset-0 z-[100] lg:hidden"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="منوی کاربری"
    >
      {/* پس‌زمینه تیره */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* شیت اصلی */}
      <div
        className="fixed inset-x-0 bottom-0 flex max-h-[92vh] flex-col rounded-t-[28px] shadow-[0_-10px_36px_rgba(51,5,9,0.2)] animate-slide-up"
        style={{ backgroundColor: "var(--color-bg-page)" }}
      >
        {/* دستگیره و عنوان */}
        <div className="shrink-0 px-5 pt-3 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-gray-300"
            aria-label="بستن منو"
          />
          <div className="flex items-center justify-between">
            <h2
              className="text-[17px] font-black"
              style={{ color: "var(--color-emerald)" }}
            >
              کاربری
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm transition-transform active:scale-90"
              aria-label="بستن"
            >
              <i className="ti ti-x text-[18px]" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          {/* کارت کاربر */}
          <div
            className="relative overflow-hidden rounded-[24px] p-4 shadow-[0_10px_24px_rgba(51,5,9,0.25)]"
            style={{
              background:
                "linear-gradient(140deg, #5a0d15 0%, var(--color-emerald) 65%)",
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-10 -left-10 h-32 w-32 rounded-full"
              style={{ background: "rgba(197,160,89,.16)" }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-12 right-10 h-28 w-28 rounded-full"
              style={{ background: "rgba(197,160,89,.08)" }}
            />

            <div className="relative flex items-center gap-3.5">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] text-[22px] font-black shadow-inner"
                style={{
                  background:
                    "linear-gradient(145deg, #e6c887, var(--color-gold-500))",
                  color: "var(--color-emerald)",
                }}
              >
                {userName.charAt(0) || (
                  <i className="ti ti-user text-[24px]" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-black text-white">
                  {userName || userPhone}
                </p>
                {userPhone && userName !== userPhone && (
                  <p
                    className="mt-0.5 text-[12px] font-medium text-white/60"
                    dir="ltr"
                    style={{ textAlign: "right" }}
                  >
                    {userPhone}
                  </p>
                )}
                <span
                  className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${status.chip}`}
                >
                  <i className={`ti ${status.icon} text-[12px]`} aria-hidden="true" />
                  {status.label}
                </span>
              </div>
              {!locked && (
                <Link
                  href="/dashboard/me"
                  onClick={onClose}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white/80 transition-colors active:bg-white/20"
                  style={{ background: "rgba(255,255,255,.1)" }}
                  aria-label="اطلاعات حساب کاربری"
                >
                  <i className="ti ti-chevron-left text-[18px]" aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>

          {/* هشدار احراز هویت */}
          {!isVerified && (
            <div
              className={`mt-3 flex items-center gap-3 rounded-2xl border p-3.5 ${
                isPending
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              <i
                className={`ti ${isPending ? "ti-clock" : "ti-shield-exclamation"} text-[22px] shrink-0`}
                aria-hidden="true"
              />
              <p className="flex-1 text-[11px] font-bold leading-relaxed">
                {isPending
                  ? "اطلاعات شما در حال بررسی است. پس از تایید، همه بخش‌ها فعال می‌شوند."
                  : "برای استفاده از خدمات، ابتدا احراز هویت خود را تکمیل کنید."}
              </p>
              <Link
                href="/dashboard/identity"
                onClick={onClose}
                className="shrink-0 rounded-xl px-3 py-2 text-[11px] font-black text-white active:scale-95 transition-transform"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                {isPending ? "مشاهده وضعیت" : "احراز هویت"}
              </Link>
            </div>
          )}

          {/* منوها بر اساس دسته‌بندی */}
          {USER_MENU_GROUPS.map((group) => (
            <section key={group.title} className="mt-5">
              <h3 className="mb-2 px-1 text-[11px] font-black text-gray-400">
                {group.title}
              </h3>
              <div
                className="overflow-hidden rounded-[20px] bg-white shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
                style={{ border: "1px solid var(--color-border)" }}
              >
                {group.items.map((item, idx) => {
                  const isActive = item.path === activePath;
                  const isLocked = locked && !isIdentityFreePath(item.path);
                  const rowClass = `flex items-center gap-3 px-3.5 py-3 transition-colors ${
                    idx > 0 ? "border-t border-gray-100" : ""
                  } ${isLocked ? "cursor-not-allowed opacity-50" : "active:bg-gray-50"}`;

                  const content = (
                    <>
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px]"
                        style={{
                          background: isActive
                            ? "var(--color-emerald)"
                            : "var(--color-gold-50)",
                          color: isActive
                            ? "var(--color-gold-500)"
                            : "var(--color-emerald)",
                        }}
                      >
                        <i className={`ti ${item.icon} text-[20px]`} aria-hidden="true" />
                      </span>
                      <span
                        className={`flex-1 text-[13px] ${isActive ? "font-black" : "font-bold"}`}
                        style={{
                          color: isActive ? "var(--color-emerald)" : "#374151",
                        }}
                      >
                        {item.name}
                      </span>
                      <i
                        className={`ti ${isLocked ? "ti-lock" : "ti-chevron-left"} text-[16px] text-gray-300`}
                        aria-hidden="true"
                      />
                    </>
                  );

                  return isLocked ? (
                    <div key={item.path} className={rowClass} aria-disabled="true">
                      {content}
                    </div>
                  ) : (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={onClose}
                      className={rowClass}
                      aria-current={isActive ? "page" : undefined}
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}

          {/* خروج */}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-5 mb-2 flex w-full items-center justify-center gap-2 rounded-[20px] border border-red-100 bg-white p-3.5 text-[13px] font-black text-red-600 transition-colors active:bg-red-50"
          >
            <i className="ti ti-logout text-[18px]" aria-hidden="true" />
            خروج از حساب کاربری
          </button>
        </div>
      </div>
    </div>
  );
}
