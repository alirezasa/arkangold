"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  Settings2,
  Smartphone,
  Bell,
  Gift,
  Copy,
  Check,
  Trash2,
  Loader2,
  ChevronLeft,
  Wifi,
  WifiOff,
} from "lucide-react";
import { usePWA } from "@/app/hooks/usePWA";
import { useProfilePage } from "@/app/hooks/useProfilePage";

type NotifPermission = NotificationPermission | "unsupported";

const subscribeNoop = () => () => {};
const readNotifPermission = (): NotifPermission =>
  "Notification" in window ? Notification.permission : "unsupported";
const serverNotifPermission = (): NotifPermission => "default";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-3 rounded-2xl p-5"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
      }}
    >
      <h2 className="flex items-center gap-2 text-[14px] font-black text-gray-800">
        <Icon className="h-4 w-4 text-gold-500" />
        {title}
      </h2>
      {children}
    </section>
  );
}

const QUICK_LINKS = [
  { title: "اطلاعات حساب کاربری", href: "/dashboard/me", icon: "ti-user-circle" },
  { title: "احراز هویت", href: "/dashboard/identity", icon: "ti-shield-check" },
  { title: "حساب‌ها و کارت‌های بانکی", href: "/dashboard/cards", icon: "ti-credit-card" },
  { title: "امنیت و تغییر رمز عبور", href: "/dashboard/security", icon: "ti-lock" },
];

export default function SettingsPage() {
  const { isInstallable, isInstalled, isIOS, isOffline, promptInstall } = usePWA();
  const { data: profile } = useProfilePage();

  // وضعیت اولیه از مرورگر؛ پس از درخواست کاربر، نتیجه جدید جایگزین می‌شود
  const initialNotifPermission = useSyncExternalStore(
    subscribeNoop,
    readNotifPermission,
    serverNotifPermission,
  );
  const [requestedPermission, setRequestedPermission] =
    useState<NotifPermission | null>(null);
  const notifPermission = requestedPermission ?? initialNotifPermission;
  const [copied, setCopied] = useState(false);
  const [clearing, setClearing] = useState(false);

  const requestNotifications = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setRequestedPermission(result);
  };

  const copyReferral = async () => {
    if (!profile?.referralCode) return;
    try {
      await navigator.clipboard.writeText(profile.referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // مرورگر اجازه دسترسی به کلیپ‌بورد نداد
    }
  };

  // پاک‌سازی کش سرویس‌ورکر و بارگذاری مجدد (برای رفع مشکلات نمایش نسخه قدیمی)
  const clearAppCache = async () => {
    setClearing(true);
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } finally {
      window.location.reload();
    }
  };

  const notifLabel: Record<NotifPermission, string> = {
    granted: "فعال",
    denied: "مسدود شده در مرورگر",
    default: "غیرفعال",
    unsupported: "پشتیبانی نمی‌شود",
  };

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ backgroundColor: "var(--color-gold-50)" }}
        >
          <Settings2 className="h-5 w-5" style={{ color: "var(--color-emerald)" }} />
        </div>
        <div>
          <h1 className="text-lg font-black text-gray-900">تنظیمات پیشرفته</h1>
          <p className="mt-0.5 text-xs text-gray-400">
            تنظیمات اپلیکیشن، اعلان‌ها و دسترسی‌های سریع
          </p>
        </div>
      </div>

      {/* اپلیکیشن */}
      <Section icon={Smartphone} title="اپلیکیشن">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-gray-700">نصب اپلیکیشن آرکان گلد</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              {isInstalled
                ? "اپلیکیشن روی این دستگاه نصب شده است"
                : isIOS
                  ? "در Safari از منوی اشتراک‌گذاری، گزینه Add to Home Screen را بزنید"
                  : "دسترسی سریع‌تر از صفحه اصلی گوشی"}
            </p>
          </div>
          {isInstalled ? (
            <span className="shrink-0 rounded-lg bg-green-50 px-3 py-1.5 text-[11px] font-bold text-green-700">
              نصب شده
            </span>
          ) : (
            isInstallable &&
            !isIOS && (
              <button
                type="button"
                onClick={() => promptInstall()}
                className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                نصب
              </button>
            )
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <p className="text-[13px] font-bold text-gray-700">وضعیت اتصال</p>
          <span
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold ${
              isOffline ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"
            }`}
          >
            {isOffline ? <WifiOff className="h-3.5 w-3.5" /> : <Wifi className="h-3.5 w-3.5" />}
            {isOffline ? "آفلاین" : "آنلاین"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
          <div>
            <p className="text-[13px] font-bold text-gray-700">پاک‌سازی حافظه موقت</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              در صورت نمایش اطلاعات قدیمی، حافظه موقت را پاک کنید
            </p>
          </div>
          <button
            type="button"
            onClick={clearAppCache}
            disabled={clearing}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-60"
          >
            {clearing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            پاک‌سازی
          </button>
        </div>
      </Section>

      {/* اعلان‌ها */}
      <Section icon={Bell} title="اعلان‌ها">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-bold text-gray-700">اعلان‌های مرورگر</p>
            <p className="mt-0.5 text-[11px] text-gray-400">
              وضعیت: {notifLabel[notifPermission]}
            </p>
          </div>
          {notifPermission === "default" && (
            <button
              type="button"
              onClick={requestNotifications}
              className="shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              فعال‌سازی
            </button>
          )}
        </div>
        {notifPermission === "denied" && (
          <p className="rounded-xl bg-amber-50 p-3 text-[11px] leading-relaxed text-amber-800">
            اعلان‌ها در تنظیمات مرورگر مسدود شده‌اند. برای فعال‌سازی، از تنظیمات
            سایت در مرورگر اجازه نمایش اعلان را صادر کنید.
          </p>
        )}
      </Section>

      {/* کد معرف */}
      {profile?.referralCode && (
        <Section icon={Gift} title="کد معرف شما">
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            <span
              className="font-mono text-[15px] font-black tracking-widest"
              style={{ color: "var(--color-emerald)" }}
              dir="ltr"
            >
              {profile.referralCode}
            </span>
            <button
              type="button"
              onClick={copyReferral}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[11px] font-bold text-gray-600 shadow-sm"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "کپی شد" : "کپی"}
            </button>
          </div>
          <Link
            href="/dashboard/referral"
            className="flex items-center justify-between rounded-xl px-4 py-3 text-[12px] font-bold text-white"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            لینک دعوت، آمار دعوت‌ها و پاداش‌ها
            <ChevronLeft className="h-4 w-4" />
          </Link>
        </Section>
      )}

      {/* دسترسی سریع */}
      <div
        className="overflow-hidden rounded-2xl"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        {QUICK_LINKS.map((link, idx) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-gray-50 ${
              idx > 0 ? "border-t border-gray-100" : ""
            }`}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: "var(--color-gold-50)",
                color: "var(--color-emerald)",
              }}
            >
              <i className={`ti ${link.icon} text-[18px]`} aria-hidden="true" />
            </span>
            <span className="flex-1 text-[13px] font-bold text-gray-700">{link.title}</span>
            <ChevronLeft className="h-4 w-4 text-gray-300" />
          </Link>
        ))}
      </div>
    </div>
  );
}
