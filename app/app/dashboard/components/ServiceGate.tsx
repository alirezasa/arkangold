"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAppServices, type AppServiceKey } from "@/app/hooks/useAppServices";

const SERVICE_TITLES: Record<AppServiceKey, string> = {
  meltedGold: "طلای آب‌شده",
  goldIngot: "شمش طلا",
  jewelry: "زیورآلات",
};

/**
 * اگر خدمت از پنل ادمین غیرفعال شده باشد، به‌جای محتوای صفحه پیام غیرفعال بودن
 * نمایش داده می‌شود (تا ورود مستقیم با آدرس صفحه هم ممکن نباشد).
 */
export default function ServiceGate({
  service,
  children,
}: {
  service: AppServiceKey;
  children: ReactNode;
}) {
  const { isEnabled, loading, error } = useAppServices();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
      </div>
    );
  }

  // در صورت خطای دریافت تنظیمات، صفحه نمایش داده می‌شود
  if (error || isEnabled(service) !== false) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto mt-10 max-w-md" dir="rtl">
      <div
        className="rounded-3xl p-8 text-center"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{
            background: "var(--color-gold-50)",
            color: "var(--color-emerald)",
          }}
        >
          <i className="ti ti-lock text-[30px]" aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-lg font-black text-gray-900">
          {SERVICE_TITLES[service]} در حال حاضر غیرفعال است
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">
          این خدمت موقتاً توسط مدیریت غیرفعال شده است. لطفاً بعداً دوباره
          مراجعه کنید.
        </p>
        <Link
          href="/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          بازگشت به پیشخوان
        </Link>
      </div>
    </div>
  );
}
