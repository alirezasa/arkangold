"use client";

import { useSyncExternalStore, useState } from "react";
import { usePathname } from "next/navigation";
import { usePWA } from "@/app/hooks/usePWA";

// پیشنهاد نصب پس از بستن، تا یک هفته دوباره نمایش داده نمی‌شود
const DISMISS_KEY = "arkan-pwa-install-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function wasDismissedRecently(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

function rememberDismiss() {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // دسترسی به localStorage ممکن نیست (حالت خصوصی و ...)
  }
}

function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function PWAProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isOffline, isInstallable, isIOS, isInstalled, promptInstall } =
    usePWA();

  const hydrated = useHydrated();
  // خواندن از localStorage فقط در کلاینت انجام می‌شود؛ رندر پیشنهاد نصب هم تا hydrate
  // شدن صفحه انجام نمی‌شود، پس عدم تطابق hydration پیش نمی‌آید
  const [dismissed, setDismissed] = useState(wasDismissedRecently);
  const dismiss = () => {
    rememberDismiss();
    setDismissed(true);
  };

  // پیشنهاد نصب فقط داخل داشبورد نمایش داده می‌شود؛ در صفحات ورود/ثبت‌نام روی
  // دکمه‌ی اصلی فرم قرار می‌گرفت و مانع ورود کاربر می‌شد
  const pathname = usePathname();
  const showInstallHint = !dismissed && (pathname?.startsWith("/dashboard") ?? false);

  return (
    <>
      {children}

      {hydrated && isOffline && (
        <div
          className="fixed left-0 right-0 z-9999 flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-bold text-white"
          style={{ background: "#dc2626", top: "env(safe-area-inset-top)" }}
          role="alert"
          aria-live="assertive"
        >
          <i className="ti ti-wifi-off text-[16px]" aria-hidden="true" />
          <span>اتصال اینترنت قطع است</span>
        </div>
      )}

      {hydrated &&
        isInstallable &&
        !isIOS &&
        !isInstalled &&
        showInstallHint && (
          <div
            className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-3 right-3 z-9998 rounded-[14px] p-4 shadow-xl lg:bottom-4 lg:left-auto lg:right-4 lg:w-85"
            style={{
              backgroundColor: "var(--color-emerald)",
              border: "1px solid rgba(197,160,89,.3)",
            }}
            role="complementary"
            aria-label="نصب اپلیکیشن"
          >
            <div className="flex items-start gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/icons/icon-96x96.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 shrink-0 rounded-[10px] ring-1 ring-gold-500/40"
              />

              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white">
                  آرکان گلد را نصب کنید
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-white/60">
                  دسترسی سریع تر، بدون مرورگر
                </p>
              </div>

              <button
                type="button"
                onClick={dismiss}
                className="shrink-0 p-1 text-white/40 transition-colors hover:text-white/80"
                aria-label="بستن"
              >
                <i className="ti ti-x text-[16px]" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={promptInstall}
                className="flex-1 rounded-[9px] py-2 text-[13px] font-bold transition-opacity hover:opacity-90"
                style={{
                  background: "var(--color-gold-500)",
                  color: "var(--color-emerald)",
                  border: "none",
                }}
              >
                نصب رایگان
              </button>

              <button
                type="button"
                onClick={dismiss}
                className="rounded-[9px] px-4 py-2 text-[13px] font-bold text-white/70 transition-colors hover:text-white"
                style={{
                  background: "rgba(255,255,255,.1)",
                  border: "none",
                }}
              >
                بعدا
              </button>
            </div>
          </div>
        )}

      {hydrated && isIOS && !isInstalled && showInstallHint && (
        <div
          className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom))] left-3 right-3 z-9998 rounded-[14px] p-4 shadow-xl"
          style={{
            backgroundColor: "var(--color-emerald)",
            border: "1px solid rgba(197,160,89,.3)",
          }}
          role="complementary"
          aria-label="نصب روی iOS"
        >
          <button
            type="button"
            onClick={dismiss}
            className="absolute left-3 top-3 p-1 text-white/40 transition-colors hover:text-white/80"
            aria-label="بستن"
          >
            <i className="ti ti-x text-[16px]" aria-hidden="true" />
          </button>

          <p className="mb-2 text-[13px] font-bold text-white">
            نصب روی iPhone / iPad
          </p>

          <ol className="space-y-2 text-[12px] text-white/80">
            <li className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: "var(--color-gold-500)",
                  color: "var(--color-emerald)",
                }}
              >
                ۱
              </span>
              روی آیکون{" "}
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-bold"
                style={{ background: "rgba(255,255,255,.15)" }}
              >
                <i className="ti ti-share" aria-hidden="true" /> اشتراک گذاری
              </span>{" "}
              کلیک کنید
            </li>

            <li className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: "var(--color-gold-500)",
                  color: "var(--color-emerald)",
                }}
              >
                ۲
              </span>
              گزینه{" "}
              <span
                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-bold"
                style={{ background: "rgba(255,255,255,.15)" }}
              >
                Add to Home Screen
              </span>{" "}
              را انتخاب کنید
            </li>

            <li className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                style={{
                  background: "var(--color-gold-500)",
                  color: "var(--color-emerald)",
                }}
              >
                ۳
              </span>
              روی{" "}
              <span
                className="rounded px-1.5 py-0.5 font-bold"
                style={{ background: "rgba(255,255,255,.15)" }}
              >
                Add
              </span>{" "}
              بزنید
            </li>
          </ol>

          <div
            className="mx-auto mt-3 h-0 w-0"
            style={{
              borderLeft: "8px solid transparent",
              borderRight: "8px solid transparent",
              borderTop: "8px solid rgba(197,160,89,.5)",
            }}
            aria-hidden="true"
          />
        </div>
      )}
    </>
  );
}
