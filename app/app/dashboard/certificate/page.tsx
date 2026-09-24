"use client";

import { useState } from "react";
import { Award, Printer, Loader2, AlertCircle, Info } from "lucide-react";
import { useProfilePage } from "@/app/hooks/useProfilePage";
import { useWallet } from "@/app/hooks/useWallet";
import { useMarketPrice } from "@/app/hooks/useTrading";

function maskNationalCode(code: string | null | undefined) {
  if (!code || code.length < 10) return code || "—";
  return `${code.slice(0, 3)}****${code.slice(-3)}`;
}

function toFaDigits(value: string) {
  return value.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-gold-500/30 py-2.5 last:border-b-0">
      <span className="text-[12px] font-bold text-gray-500">{label}</span>
      <span
        className="text-[13px] font-black text-gray-800"
        dir={ltr ? "ltr" : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export default function CertificatePage() {
  const { data: profile } = useProfilePage();
  const { wallet, loading: walletLoading, error: walletError } = useWallet();
  const { price, loading: priceLoading } = useMarketPrice();
  // زمان صدور یک‌بار هنگام باز شدن صفحه ثبت می‌شود
  const [issuedAt] = useState(() => new Date());

  const fullName = [profile?.identity?.firstName, profile?.identity?.lastName]
    .filter(Boolean)
    .join(" ");
  const grams = wallet?.goldBalanceGrams ?? 0;
  const pricePerGram = price ? Number(price.pricePerGramToman) : 0;
  const valueToman = Math.round(grams * pricePerGram);

  const serial = wallet
    ? `AG-${wallet.id.replace(/-/g, "").slice(0, 8).toUpperCase()}-${issuedAt
        .toISOString()
        .slice(0, 10)
        .replace(/-/g, "")}`
    : "—";

  const issuedDate = issuedAt.toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const issuedTime = issuedAt.toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const loading = walletLoading || priceLoading;

  return (
    <div className="mx-auto max-w-2xl space-y-5 pb-24" dir="rtl">
      {/* فقط خود گواهی چاپ شود */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #investment-certificate, #investment-certificate * { visibility: visible !important; }
          #investment-certificate { position: fixed; inset: 0; margin: 24px; box-shadow: none !important; }
        }
      `}</style>

      {/* هدر */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: "var(--color-gold-50)" }}
          >
            <Award className="h-5 w-5" style={{ color: "var(--color-emerald)" }} />
          </div>
          <div>
            <h1 className="text-lg font-black text-gray-900">گواهی سرمایه</h1>
            <p className="mt-0.5 text-xs text-gray-400">
              گواهی موجودی طلای کیف پول شما بر اساس قیمت لحظه‌ای
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          disabled={loading || !wallet}
          className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[12px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          <Printer className="h-4 w-4" />
          چاپ / ذخیره PDF
        </button>
      </div>

      {walletError && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-[13px] font-bold text-red-600">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {walletError}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
        </div>
      ) : (
        wallet && (
          <div
            id="investment-certificate"
            className="relative overflow-hidden rounded-[28px] bg-white p-6 shadow-[0_12px_40px_rgba(51,5,9,0.1)] sm:p-8"
            style={{ border: "2px solid var(--color-gold-500)" }}
          >
            {/* قاب داخلی تزئینی */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-2 rounded-[22px]"
              style={{ border: "1px solid rgba(197,160,89,.35)" }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full"
              style={{ background: "rgba(197,160,89,.08)" }}
            />

            <div className="relative">
              {/* سربرگ */}
              <div className="mb-6 flex flex-col items-center text-center">
                <div
                  className="mb-3 flex h-16 w-16 items-center justify-center rounded-full shadow-[0_6px_18px_rgba(197,160,89,.4)]"
                  style={{
                    background: "linear-gradient(145deg, #e6c887, var(--color-gold-500), #8c703b)",
                    color: "var(--color-emerald)",
                  }}
                >
                  <Award className="h-8 w-8" />
                </div>
                <h2 className="text-[20px] font-black" style={{ color: "var(--color-emerald)" }}>
                  گواهی سرمایه طلا
                </h2>
                <p className="mt-1 text-[12px] font-bold text-gold-600">
                  آرکان گلد — پلتفرم طلای آب‌شده
                </p>
              </div>

              <p className="mb-5 text-center text-[13px] leading-loose text-gray-600">
                بدین‌وسیله گواهی می‌شود{" "}
                <span className="font-black text-gray-900">{fullName || profile?.phone}</span>{" "}
                در تاریخ <span className="font-black text-gray-900">{issuedDate}</span>{" "}
                دارای موجودی طلای زیر در کیف پول آرکان گلد می‌باشد.
              </p>

              {/* مبلغ اصلی */}
              <div
                className="mb-5 rounded-2xl p-5 text-center"
                style={{
                  background: "linear-gradient(140deg, #5a0d15 0%, var(--color-emerald) 70%)",
                }}
              >
                <p className="text-[12px] font-bold text-white/60">موجودی طلا</p>
                <p className="mt-1 text-[28px] font-black text-white">
                  {grams.toLocaleString("fa-IR", { maximumFractionDigits: 4 })}
                  <span className="mr-1.5 text-[14px] font-bold" style={{ color: "var(--color-gold-500)" }}>
                    گرم
                  </span>
                </p>
                <p className="mt-1 text-[13px] font-bold" style={{ color: "var(--color-gold-500)" }}>
                  معادل {valueToman.toLocaleString("fa-IR")} تومان
                </p>
              </div>

              {/* جزئیات */}
              <div className="rounded-2xl px-4" style={{ backgroundColor: "var(--color-gold-50)" }}>
                <Row label="نام و نام خانوادگی" value={fullName || "—"} />
                <Row label="کد ملی" value={toFaDigits(maskNationalCode(profile?.identity?.nationalCode))} />
                <Row label="شماره کیف پول" value={toFaDigits(wallet.cardNumber)} ltr />
                <Row
                  label="قیمت هر گرم (لحظه صدور)"
                  value={`${pricePerGram.toLocaleString("fa-IR")} تومان`}
                />
                <Row label="تاریخ و ساعت صدور" value={`${issuedDate} — ${issuedTime}`} />
                <Row label="شماره گواهی" value={serial} ltr />
              </div>

              <p className="mt-5 flex items-start gap-1.5 text-[10px] leading-relaxed text-gray-400">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                این گواهی بر اساس موجودی لحظه‌ای کیف پول و قیمت روز طلا در زمان صدور
                تهیه شده و ارزش ریالی آن با تغییر قیمت بازار تغییر می‌کند.
              </p>
            </div>
          </div>
        )
      )}
    </div>
  );
}
