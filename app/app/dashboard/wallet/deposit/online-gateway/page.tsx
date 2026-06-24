"use client";

import Link from "next/link";
import { useState } from "react";
// فرض بر این است که این هوک‌ها درست ایمپورت شده‌اند
import { useDepositConfig } from "@/app/hooks/useWallet";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import { ChevronLeft, Zap, AlertCircle, Loader2 } from "lucide-react";

function toToman(rial: number) {
  return (rial / 10).toLocaleString("fa-IR");
}

export default function OnlineGatewayPage() {
  const { config, loading } = useDepositConfig();
  const { data: goldPrice } = useGoldPrice();
  
  // تغییر مهم: State فقط رشته عددی خام را نگه می‌دارد (بدون کاما و حروف فارسی)
  const [amount, setAmount] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const cfg = config?.online;

  const handlePay = () => {
    // چون مقدار خام در state ذخیره شده، دیگر نیازی به حذف کاما نیست
    const amountRial = Number(amount) * 10;
    
    if (!amountRial || amountRial < (cfg?.minAmount ?? 100000)) {
      return setError(`حداقل مبلغ ${toToman(cfg?.minAmount ?? 100000)} تومان است`);
    }
    if (amountRial > (cfg?.maxAmount ?? 400000000)) {
      return setError(`حداکثر مبلغ ${toToman(cfg?.maxAmount ?? 400000000)} تومان است`);
    }
    // TODO: هدایت به درگاه واقعی
    alert("درگاه پرداخت به زودی فعال می‌شود");
  };

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/dashboard/wallet/deposit"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50">
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">درگاه آنلاین</h1>
          <p className="text-[11px] text-gray-400">
            روزانه تا {toToman(cfg?.dailyLimit ?? 400000000)} تومان | در لحظه
          </p>
        </div>
        {goldPrice && (
          <div className="mr-auto px-3 py-1.5 rounded-xl text-[11px] font-bold"
            style={{ background: "rgba(197,160,89,.1)", color: "#92400e" }}>
            🪙 {(goldPrice.price * 1000).toLocaleString("fa-IR")} ت
          </div>
        )}
      </div>

      {/* هشدار غیرفعال بودن */}
      {!loading && cfg && !cfg.enabled && (
        <div className="mb-4 p-4 rounded-xl flex items-start gap-3 text-[13px]"
          style={{ backgroundColor: "#fef3c7", border: "1px solid #fcd34d", color: "#92400e" }}>
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-black mb-1">درگاه آنلاین موقتاً غیرفعال است</p>
            <p className="font-medium">این سرویس به زودی فعال می‌شود. تا آن زمان از روش‌های دیگر واریز استفاده کنید.</p>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
        </div>
      )}

      <div className="rounded-2xl p-5 space-y-5"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        <div>
          <h2 className="text-[14px] font-black text-gray-800 mb-1">مبلغ افزایش اعتبار</h2>
          <p className="text-[12px] text-gray-400">
            {toToman(cfg?.minAmount ?? 100000)} ~ {toToman(cfg?.maxAmount ?? 400000000)} تومان
          </p>
        </div>

        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            dir="ltr"
            placeholder="مبلغ را وارد کنید"
            // تبدیل عدد خام انگلیسی به فرمت فارسیِ کامادار فقط موقع نمایش
            value={amount ? Number(amount).toLocaleString("fa-IR") : ""}
            disabled={!cfg?.enabled}
            onChange={(e) => {
              let val = e.target.value;
              
              // تبدیل اعداد تایپ شده با کیبورد فارسی/عربی به انگلیسی 
              const persianNumbers = [/۰/g, /۱/g, /۲/g, /۳/g, /۴/g, /۵/g, /۶/g, /۷/g, /۸/g, /۹/g];
              const arabicNumbers  = [/٠/g, /١/g, /٢/g, /٣/g, /٤/g, /٥/g, /٦/g, /٧/g, /٨/g, /٩/g];
              for (let i = 0; i < 10; i++) {
                val = val.replace(persianNumbers[i], i.toString()).replace(arabicNumbers[i], i.toString());
              }

              // حذف هر کاراکتری که عدد نیست
              const raw = val.replace(/[^0-9]/g, "");
              
              setAmount(raw);
              setError(null);
            }}
            // تغییرات استایل: استفاده از pr-4 و pl-14 برای رفع مشکل چسبیدن به "تومان"
            // استفاده از text-right برای اینکه مبالغ از سمت راست پر شوند و خواناتر باشند
            className="w-full py-4 pr-4 pl-14 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-right text-[20px] font-black text-gray-800 bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[13px] font-bold text-gray-400">
            تومان
          </span>
        </div>

        {/* مبالغ پیشنهادی */}
        <div className="grid grid-cols-4 gap-2">
          {[1_000_000, 5_000_000, 10_000_000, 25_000_000].map((v) => (
            <button key={v}
              disabled={!cfg?.enabled}
              // اینجا هم مقدار خام در State ذخیره می‌شود
              onClick={() => { setAmount(v.toString()); setError(null); }}
              className="py-2 rounded-xl text-[11px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              {v >= 1_000_000 ? `${v / 1_000_000}م` : `${v / 1000}ه`}
            </button>
          ))}
        </div>

        <button
          onClick={handlePay}
          disabled={loading || !amount || !cfg?.enabled}
          className="w-full py-4 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-40"
          style={{ backgroundColor: "var(--color-green)" }}
        >
          {loading
            ? <Loader2 className="w-5 h-5 animate-spin" />
            : <><Zap className="w-4 h-4" />افزایش اعتبار</>
          }
        </button>
      </div>
    </div>
  );
}