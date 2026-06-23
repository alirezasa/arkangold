"use client";

import Link from "next/link";
import { useDepositConfig } from "@/app/hooks/useWallet";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { ChevronLeft, Loader2, AlertCircle } from "lucide-react";

// ── ریال از API → نمایش تومان ──
function rialToDisplay(rial: number): string {
  const toman = rial / 10;
  if (toman === 0) return "بدون محدودیت";
  if (toman >= 1_000_000_000)
    return `${(toman / 1_000_000_000).toLocaleString("fa-IR")} میلیارد تومان`;
  if (toman >= 1_000_000)
    return `${(toman / 1_000_000).toLocaleString("fa-IR")} میلیون تومان`;
  return `${toman.toLocaleString("fa-IR")} تومان`;
}

export default function DepositSelectPage() {
  const { config, loading } = useDepositConfig();
  const { data: goldPrice } = useGoldPrice();

  const methods = config
    ? [
        {
          key: "online-gateway",
          title: "درگاه آنلاین",
          subtitle: `روزانه تا ${rialToDisplay(config.online.dailyLimit)}`,
          badge: "در لحظه",
          badgeColor: "bg-green-100 text-green-700",
          icon: "ti-device-desktop",
          iconBg: "bg-blue-50",
          iconColor: "text-blue-600",
          href: "/dashboard/wallet/deposit/online-gateway",
          enabled: config.online.enabled,
          disabledMsg: "به زودی",
        },
        {
          key: "card-to-card",
          title: "کارت به کارت",
          subtitle: `روزانه تا سقف ${rialToDisplay(config.cardToCard.dailyLimit)}`,
          badge: "کمتر از ۱۰ دقیقه",
          badgeColor: "bg-amber-100 text-amber-700",
          icon: "ti-credit-card",
          iconBg: "bg-amber-50",
          iconColor: "text-amber-600",
          href: "/dashboard/wallet/deposit/card-to-card",
          enabled: config.cardToCard.enabled,
        },
        {
          key: "bank-transfer",
          title: "حساب به حساب",
          subtitle: "واریز بدون محدودیت",
          badge: "واریز در سیکل پایا",
          badgeColor: "bg-purple-100 text-purple-700",
          icon: "ti-building-bank",
          iconBg: "bg-purple-50",
          iconColor: "text-purple-600",
          href: "/dashboard/wallet/deposit/bank-transfer",
          enabled: config.bankTransfer.enabled,
        },
        {
          key: "tracking-id",
          title: "واریز شناسه‌دار",
          subtitle: `واریز تا سقف ${rialToDisplay(config.trackingId.dailyLimit)} | سیکل پایا`,
          badge: "پایا",
          badgeColor: "bg-indigo-100 text-indigo-700",
          icon: "ti-fingerprint",
          iconBg: "bg-indigo-50",
          iconColor: "text-indigo-600",
          href: "/dashboard/wallet/deposit/tracking-id",
          enabled: config.trackingId.enabled,
        },
        {
          key: "large-transfer",
          title: "مبالغ بالا (پیش‌فاکتور)",
          subtitle: `واریز مبالغ بیش از ${rialToDisplay(config.largeTransfer.minAmount)} | سیکل پایا`,
          badge: "پایا",
          badgeColor: "bg-rose-100 text-rose-700",
          icon: "ti-building-bank",
          iconBg: "bg-rose-50",
          iconColor: "text-rose-600",
          href: "/dashboard/wallet/deposit/large-transfer",
          enabled: config.largeTransfer.enabled,
        },
        {
          key: "direct",
          title: "واریز مستقیم",
          subtitle: `روزانه تا ${rialToDisplay(config.direct.dailyLimit)}`,
          badge: "در لحظه",
          badgeColor: "bg-teal-100 text-teal-700",
          icon: "ti-transfer",
          iconBg: "bg-teal-50",
          iconColor: "text-teal-600",
          href: "/dashboard/wallet/deposit/direct",
          enabled: config.direct.enabled,
        },
      ]
    : [];

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-24" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3 mb-2">
        <Link
          href="/dashboard/wallet"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">
            انتخاب روش واریز
          </h1>
          <p className="text-[11px] text-gray-400 mt-0.5">
            روش مناسب را انتخاب کنید
          </p>
        </div>
      </div>

      {/* قیمت لحظه‌ای */}
      {goldPrice && (
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm"
          style={{
            background: "rgba(197,160,89,.1)",
            border: "1px solid rgba(197,160,89,.3)",
          }}
        >
          <div className="flex items-center gap-2">
            <span>🪙</span>
            <span className="text-[12px] font-bold text-amber-800">
              قیمت لحظه‌ای طلا:
            </span>
          </div>
          <span className="font-black text-amber-900 text-[13px]">
            {(goldPrice.price * 1000).toLocaleString("fa-IR")} تومان
          </span>
        </div>
      )}

      {/* لیست روش‌ها */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-7 h-7 animate-spin text-gray-400" />
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: "1px solid var(--color-border)" }}
        >
          {methods.map((method, idx) => {
            const Inner = (
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${method.iconBg}`}
                >
                  <i
                    className={`ti ${method.icon} text-[20px] ${method.iconColor}`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-[14px] font-black text-gray-800">
                      {method.title}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${method.badgeColor}`}
                    >
                      {method.badge}
                    </span>
                    {!method.enabled && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                        {(method as { disabledMsg?: string }).disabledMsg ??
                          "غیرفعال"}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-gray-500 truncate">
                    {method.subtitle}
                  </p>
                </div>
                <ChevronLeft
                  className={`w-4 h-4 shrink-0 ${method.enabled ? "text-gray-400" : "text-gray-200"}`}
                />
              </div>
            );

            return method.enabled ? (
              <Link
                key={method.key}
                href={method.href}
                className="flex items-center px-4 py-4 transition-colors hover:bg-gray-50 active:bg-gray-100"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderTop:
                    idx > 0 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                {Inner}
              </Link>
            ) : (
              <div
                key={method.key}
                className="flex items-center px-4 py-4 opacity-50 cursor-not-allowed"
                style={{
                  backgroundColor: "var(--color-surface)",
                  borderTop:
                    idx > 0 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                {Inner}
              </div>
            );
          })}
        </div>
      )}

      {/* نکته امنیتی */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl text-[12px]"
        style={{
          backgroundColor: "#fefce8",
          border: "1px solid #fef08a",
          color: "#713f12",
        }}
      >
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
        <p>
          واریز وجه فقط از طریق کارت‌های بانکی که در سیستم ثبت کرده‌اید مجاز
          است. در صورت واریز از کارت دیگری، مبلغ در سیکل پایا به حساب مبدا برگشت
          داده می‌شود.
        </p>
      </div>
    </div>
  );
}
