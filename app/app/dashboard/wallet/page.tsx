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
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "#c5a059" }}
        />
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className="max-w-lg mx-auto text-center py-16" dir="rtl">
        <p className="text-red-500 font-bold mb-4">
          {error ?? "خطا در دریافت اطلاعات"}
        </p>
        <button
          onClick={() => refresh()}
          className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald border border-gold-500/40hhover:border-gold-500transition-all"
        >
          <RefreshCw className="w-4 h-4" /> تلاش مجدد
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-24 px-4 sm:px-0" dir="rtl">
      
      {/* ── کارت اصلی موجودی (تم جدید یاغوتی و طلایی) ── */}
      <div
        className="relative overflow-hidden rounded-4xl p-6 text-white border border-gold-500/30 shadow-[0_15px_35px_rgba(51,5,9,0.25)] bg-linear-to-brrfrom-emeraldo-[#1a0204]"
      >
        {/* هاله نوری پس‌زمینه کارت */}
        <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full opacity-15 blur-2xl bg-gold-500" />
        <div className="absolute -bottom-12 -right-6 w-40 h-40 rounded-full opacity-10 blur-xl bg-gold-500" />

        {/* هدر کارت */}
        <div className="flex items-center justify-between mb-6 relative z-10">
          <span className="text-[12px] font-bold text-gold-500 tracking-wide bg-white/5 px-3 py-1 rounded-full border border-white/5">
            کیف پول آرکان گلد
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setHideBalance(!hideBalance)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white/80"
            >
              {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={() => refresh()}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-white/80"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ارزش کل دارایی */}
        <div className="relative z-10 mb-6">
          <p className="text-[11px] text-white/60 mb-1">ارزش کل دارایی (ریال + طلا)</p>
          <p className="text-[28px] sm:text-[32px] font-black tracking-tight text-white">
            {hideBalance ? "••••••••" : rialToTomanFull(totalValueRial)}
            <span className="text-[13px] font-bold text-gold-500mr-2">
              تومان
            </span>
          </p>
        </div>

        {/* تفکیک موجودی‌ها (سازه گلس‌مورفیسم یکدست) */}
        <div className="grid grid-cols-2 gap-3 relative z-10">
          {/* موجودی ریال */}
          <div className="rounded-2xl p-4 bg-white/4 border border-white/10 backdrop-blur-md">
            <p className="text-[11px] text-white/50 mb-1">موجودی نقدی</p>
            <p className="text-[16px] sm:text-[18px] font-black text-white">
              {hideBalance ? "••••••" : rialToTomanFull(wallet.rialBalance)}
              <span className="text-[10px] font-normal text-white/50 mr-1">تومان</span>
            </p>
            
            {wallet.holdRial > 0 && (
              <div className="flex items-center gap-1 mt-2 text-amber-400/80">
                <Lock className="w-3 h-3" />
                <span className="text-[10px]">
                  {rialToToman(wallet.holdRial)} ت در انتظار
                </span>
              </div>
            )}
            {wallet.holdRial > 0 && (
              <p className="text-[10px] mt-1 text-white/40">
                قابل برداشت: {rialToTomanFull(wallet.availableRial)} ت
              </p>
            )}
          </div>

          {/* موجودی طلا */}
          <div className="rounded-2xl p-4 bg-gold-500/10border bborder-gold-500/20backdrop-blur-md">
            <p className="text-[11px] text-gold-500 mb-1">موجودی طلای آبشده</p>
            <p className="text-[16px] sm:text-[18px] font-black text-[#e6c887]">
              {hideBalance ? "••••••" : wallet.goldBalanceGrams.toFixed(4)}
              <span className="text-[10px] font-normal text-[#c5a059] mr-1">گرم</span>
            </p>
            
            {goldPrice && !hideBalance && (
              <p className="text-[10px] mt-2 text-white/60">
                ≈ {rialToToman(goldValueRial)} تومان
              </p>
            )}
            {wallet.holdGrams > 0 && (
              <div className="flex items-center gap-1 mt-1 text-amber-400/80">
                <Lock className="w-3 h-3" />
                <span className="text-[10px]">
                  {wallet.holdGrams.toFixed(4)} گ در انتظار
                </span>
              </div>
            )}
          </div>
        </div>

        {/* شماره کارت شتابی اختصاصی کیف پول */}
        <div className="mt-5 pt-4 border-t border-white/[0.08] relative z-10 flex items-center justify-between text-white/40">
          <span className="text-[12px] tracking-[0.15em] font-medium font-mono" dir="ltr">
            {wallet.cardNumber.replace(/(.{4})/g, "$1 ").trim()}
          </span>
          <Coins className="w-4 h-4 text-[#c5a059]/60" />
        </div>
      </div>

      {/* ── دکمه‌های عملیات (طراحی فلات و مدرن) ── */}
      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/dashboard/wallet/deposit"
          className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl text-white transition-all active:scale-95 shadow-md bg-gradient-to-br from-[#16a34a] to-[#15803d] hover:shadow-[0_6px_20px_rgba(22,163,74,0.2)]"
        >
          <ArrowDownCircle className="w-6 h-6" />
          <span className="text-[14px] font-bold">واریز وجه</span>
          <span className="text-[10px] text-white/70">افزایش موجودی ریالی</span>
        </Link>

        <Link
          href="/dashboard/wallet/withdrawal"
          className="flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl transition-all active:scale-95 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750"
        >
          <ArrowUpCircle className="w-6 h-6 text-gray-700 dark:text-gray-300" />
          <span className="text-[14px] font-bold text-gray-800 dark:text-gray-200">برداشت وجه</span>
          <span className="text-[10px] text-gray-400 dark:text-gray-500">انتقال شبا به بانک</span>
        </Link>
      </div>

      {/* ── آمار مالی ── */}
      <div className="rounded-2xl p-5 space-y-4 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 shadow-sm">
        <h3 className="text-[13px] font-black text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-[#c5a059]" />
          آمار تراکنش‌های اخیر
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">واریز امروز</p>
            <p className="text-[14px] font-black text-green-600 dark:text-green-500">
              {rialToTomanFull(wallet.stats.todayDeposit)}
              <span className="text-[10px] font-normal text-gray-400 mr-1">ت</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50">
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">برداشت این ماه</p>
            <p className="text-[14px] font-black text-red-500 dark:text-red-400">
              {rialToTomanFull(wallet.stats.monthWithdrawal)}
              <span className="text-[10px] font-normal text-gray-400 mr-1">ت</span>
            </p>
          </div>
        </div>
      </div>

      {/* ── لینک‌های سریع منو ── */}
      <div className="rounded-2xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm">
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
            className="flex items-center justify-between px-5 py-4 transition-colors bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 active:bg-gray-100"
            style={{
              borderTop: idx > 0 ? "1px solid var(--color-border, #f3f4f6)" : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <i className={`ti ${item.icon} text-[18px] text-[#c5a059]`} />
              <span className="text-[13px] font-bold text-gray-700 dark:text-gray-300">
                {item.label}
              </span>
            </div>
            <ChevronLeft className="w-4 h-4 text-gray-400" />
          </Link>
        ))}
      </div>
    </div>
  );
}