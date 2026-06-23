"use client";

import Link from "next/link";
import { useWallet } from "@/app/hooks/useWallet";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Loader2,
  RefreshCw,
  Eye,
  EyeOff,
  Coins,
  Lock,
  TrendingUp,
  ChevronLeft,
} from "lucide-react";
import { useState } from "react";

function rialToToman(rial: number): string {
  const toman = rial / 10;
  if (toman >= 1_000_000_000)
    return `${(toman / 1_000_000_000).toLocaleString("fa-IR")} میلیارد`;
  if (toman >= 1_000_000)
    return `${(toman / 1_000_000).toLocaleString("fa-IR")} میلیون`;
  return toman.toLocaleString("fa-IR");
}

function rialToTomanFull(rial: number): string {
  return (rial / 10).toLocaleString("fa-IR");
}

export default function WalletPage() {
  const { wallet, loading, error, refresh } = useWallet();
  const { data: goldPrice } = useGoldPrice();
  const [hideBalance, setHideBalance] = useState(false);

  const goldValueRial = wallet
    ? wallet.goldBalanceGrams * (goldPrice?.price ?? 0) * 1000
    : 0;
  const totalValueRial = (wallet?.rialBalance ?? 0) + goldValueRial;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="max-w-md mx-auto text-center py-16" dir="rtl">
        <p className="text-red font-bold mb-4">
          {error ?? "خطا در دریافت اطلاعات"}
        </p>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald border border-gold-500/40 hover:border-gold-500 transition-all"
        >
          <RefreshCw className="w-4 h-4" /> تلاش مجدد
        </button>
      </div>
    );
  }

  return (
    // حداکثر عرض را روی دسکتاپ بزرگتر کردیم (max-w-4xl) تا فضا پر شود
    <div
      className="max-w-md md:max-w-4xl mx-auto px-4 pt-2 pb-24 safe-bottom"
      dir="rtl"
    >
      {/* هدر مینی‌مال بالای صفحه */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-[15px] font-black text-text-primary tracking-tight">
          مدیریت کیف پول
        </h1>
        <span className="text-[11px] text-text-secondary font-medium">
          پلتفرم معاملاتی آرکان گلد
        </span>
      </div>

      {/* سیستم گرید هوشمند: در موبایل تک ستونه، در دسکتاپ دو ستونه */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* ── ستون اول (کارت اصلی + دکمه‌های واریز و برداشت) ── */}
        <div className="md:col-span-7 space-y-3">
          {/* کارت اصلی دارایی (فشرده‌تر با پدینگ بهینه شده p-5) */}
          {/* ── کارت اصلی دارایی (ارتقا یافته برای خوانایی و حس لوکس) ── */}
          <div className="relative overflow-hidden rounded-[24px] p-5 border border-gold-500/30 shadow-[0_10px_30px_rgba(51,5,9,0.3)] bg-gradient-to-br from-[#330509] to-[#140103]">
            {/* هاله نوری پس‌زمینه کارت */}
            <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full opacity-15 blur-[32px] bg-gold-500 pointer-events-none" />
            
            {/* هدر کارت */}
            <div className="flex items-center justify-between mb-5 relative z-10">
              <span className="text-[10px] font-bold text-gold-600 bg-gold-500/10 px-2.5 py-1 rounded-full border border-gold-500/20 shadow-sm backdrop-blur-md">
                کیف پول آرکان گلد
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setHideBalance(!hideBalance)} className="p-1.5 rounded-lg text-gold-100/70 hover:text-gold-50 hover:bg-white/5 transition-all">
                  {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button onClick={() => refresh()} className="p-1.5 rounded-lg text-gold-100/70 hover:text-gold-50 hover:bg-white/5 transition-all">
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ارزش کل دارایی */}
            <div className="relative z-10 mb-5">
              <p className="text-[10px] text-gold-100/60 font-medium mb-1">ارزش کل دارایی (ریال + طلا)</p>
              <p className="text-[26px] font-black tracking-tight text-gold-50 drop-shadow-sm">
                {hideBalance ? "••••••••" : rialToTomanFull(totalValueRial)}
                <span className="text-[12px] font-bold text-gold-500 mr-2">تومان</span>
              </p>
            </div>

            {/* تفکیک موجودی‌ها (استفاده از بک‌گراند تیره برای کنتراست بالا) */}
            <div className="grid grid-cols-2 gap-2 relative z-10">
              {/* موجودی نقدی */}
              <div className="rounded-xl p-3 bg-black/20 border border-gold-500/10 backdrop-blur-sm shadow-inner">
                <p className="text-[10px] text-gold-100/50 font-medium mb-1">موجودی نقدی</p>
                <p className="text-[14px] font-black text-gold-50 truncate">
                  {hideBalance ? "••••••" : rialToTomanFull(wallet.rialBalance)}
                  <span className="text-[9px] font-normal text-gold-100/60 mr-1">ت</span>
                </p>
                {wallet.holdRial > 0 && (
                  <div className="flex items-center gap-0.5 mt-2 text-amber-400 text-[9px] font-bold">
                    <Lock className="w-2.5 h-2.5" />
                    <span>{rialToToman(wallet.holdRial)} ت در انتظار</span>
                  </div>
                )}
              </div>

              {/* موجودی طلا */}
              <div className="rounded-xl p-3 bg-gold-500/15 border border-gold-500/25 backdrop-blur-sm shadow-inner">
                <p className="text-[10px] text-gold-500 font-bold mb-1">طلای آبشده</p>
                <p className="text-[14px] font-black text-[#f5eed1] truncate">
                  {hideBalance ? "••••••" : wallet.goldBalanceGrams.toFixed(4)}
                  <span className="text-[9px] font-normal text-gold-500 mr-1">گرم</span>
                </p>
                {goldPrice && !hideBalance && (
                  <p className="text-[9px] mt-1.5 text-gold-100/60 font-medium truncate">
                    ≈ {rialToToman(goldValueRial)} ت
                  </p>
                )}
              </div>
            </div>

            {/* شماره کارت شتابی اختصاصی */}
            <div className="mt-4 pt-3 border-t border-gold-500/15 relative z-10 flex items-center justify-between text-gold-100/40 text-[11px]">
              <span className="tracking-[0.15em] font-mono font-medium" dir="ltr">
                {wallet.cardNumber.replace(/(.{4})/g, "$1 ").trim()}
              </span>
              <Coins className="w-4 h-4 text-gold-500/50" />
            </div>
          </div>

          {/* ── دکمه‌های عملیات (طراحی باریک، کپسولی و فوق‌العاده مدرن فین‌تک) ── */}
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/dashboard/wallet/deposit"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white font-bold text-[13px] bg-gradient-to-r from-emerald-600 to-emerald-700 active:scale-[0.98] transition-all shadow-2xs hover:brightness-110"
            >
              <ArrowDownCircle className="w-4 h-4 text-white/90" />
              واریز وجه
            </Link>

            <Link
              href="/dashboard/wallet/withdrawal"
              className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl font-bold text-[13px] bg-surface border border-gold-500/30 text-text-primary active:scale-[0.98] transition-all shadow-2xs hover:bg-bg-page/30"
            >
              <ArrowUpCircle className="w-4 h-4 text-gold-500" />
              برداشت وجه
            </Link>
          </div>
        </div>

        {/* ── ستون دوم (آمار تراکنش‌ها + منوهای سریع) ── */}
        <div className="md:col-span-5 space-y-3">
          {/* آمار مالی فشرده */}
          <div className="rounded-2xl p-4 bg-surface border border-border shadow-2xs">
            <h3 className="text-[12px] font-black text-text-primary flex items-center gap-1.5 mb-2.5">
              <TrendingUp className="w-3.5 h-3.5 text-gold-500" />
              گزارش مالی خلاصه
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-2 rounded-xl bg-bg-secondary">
                <p className="text-[9px] text-text-secondary mb-0.5">
                  واریز امروز
                </p>
                <p className="text-[12px] font-black text-emerald-600">
                  {rialToTomanFull(wallet.stats.todayDeposit)}{" "}
                  <span className="text-[9px] font-normal text-text-secondary">
                    ت
                  </span>
                </p>
              </div>
              <div className="p-2 rounded-xl bg-bg-secondary">
                <p className="text-[9px] text-text-secondary mb-0.5">
                  برداشت این ماه
                </p>
                <p className="text-[12px] font-black text-red">
                  {rialToTomanFull(wallet.stats.monthWithdrawal)}{" "}
                  <span className="text-[9px] font-normal text-text-secondary">
                    ت
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* لیست پیوندهای سریع منو */}
          <div className="rounded-2xl overflow-hidden border border-border bg-surface shadow-2xs">
            {[
              {
                label: "تاریخچه تراکنش‌ها",
                icon: "ti-history",
                href: "/dashboard/transactions",
              },
              {
                label: "حساب‌ها و کارت‌های بانکی",
                icon: "ti-credit-card",
                href: "/dashboard/cards",
              },
              {
                label: "معامله آنلاین طلای آبشده",
                icon: "ti-coins",
                href: "/dashboard/melted-gold",
              },
            ].map((item, idx) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-bg-page/40 active:bg-bg-page/80"
                style={{
                  borderTop:
                    idx > 0 ? "1px solid var(--color-border)" : undefined,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <i className={`ti ${item.icon} text-[15px] text-gold-500`} />
                  <span className="text-[12px] font-bold text-text-primary">
                    {item.label}
                  </span>
                </div>
                <ChevronLeft className="w-3.5 h-3.5 text-text-secondary/50" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
