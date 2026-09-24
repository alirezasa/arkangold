"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useDepositConfig, type DepositConfig } from "@/app/hooks/useWallet";

// نگاشت مسیر هر روش واریز به کلید آن در تنظیمات واریز
const METHOD_BY_SEGMENT: Record<string, keyof DepositConfig> = {
  "online-gateway": "online",
  "card-to-card": "cardToCard",
  "bank-transfer": "bankTransfer",
  "tracking-id": "trackingId",
  "large-transfer": "largeTransfer",
  direct: "direct",
};

/**
 * اگر روش واریز از پنل ادمین غیرفعال شده باشد، ورود مستقیم به صفحه آن روش
 * مسدود و پیام غیرفعال بودن نمایش داده می‌شود.
 */
export default function DepositLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { config, loading } = useDepositConfig();

  const segment = pathname.split("/dashboard/wallet/deposit/")[1]?.split("/")[0];
  const methodKey = segment ? METHOD_BY_SEGMENT[segment] : undefined;

  // صفحه انتخاب روش یا مسیر ناشناخته
  if (!methodKey) return <>{children}</>;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
      </div>
    );
  }

  const method = config?.[methodKey] as { enabled?: boolean } | undefined;
  if (!config || method?.enabled !== false) return <>{children}</>;

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
          این روش واریز غیرفعال است
        </h2>
        <p className="mb-6 text-sm leading-relaxed text-gray-500">
          این روش واریز در حال حاضر توسط مدیریت غیرفعال شده است. لطفاً از روش
          دیگری برای واریز به کیف پول استفاده کنید.
        </p>
        <Link
          href="/dashboard/wallet/deposit"
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          انتخاب روش دیگر
        </Link>
      </div>
    </div>
  );
}
