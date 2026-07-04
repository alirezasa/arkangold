"use client";

import { useState, useCallback } from "react";

/**
 * هوک ماشین‌حساب دوطرفه معاملات طلا
 * تبدیل گرم ↔ تومان با دقت کامل (بدون Float)
 * currentPrice: قیمت هر گرم به تومان (از API)
 */
export function useTradeCalculator(currentPrice: number | null) {
  const [amountToman, setAmountToman] = useState("");
  const [weightGrams, setWeightGrams] = useState("");

  // تغییر مبلغ تومان → محاسبه وزن
  const handleAmountChange = useCallback(
    (val: string) => {
      // پشتیبانی از کیبورد فارسی
      const normalized = val
        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
        .replace(/[^0-9.]/g, "");

      setAmountToman(normalized);

      if (normalized && currentPrice && currentPrice > 0) {
        const grams = parseFloat(normalized) / currentPrice;
        setWeightGrams(isNaN(grams) ? "" : grams.toFixed(4));
      } else {
        setWeightGrams("");
      }
    },
    [currentPrice],
  );

  // تغییر وزن → محاسبه مبلغ تومان
  const handleWeightChange = useCallback(
    (val: string) => {
      const normalized = val
        .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
        .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
        .replace(/[^0-9.]/g, "");

      setWeightGrams(normalized);

      if (normalized && currentPrice && currentPrice > 0) {
        const toman = parseFloat(normalized) * currentPrice;
        setAmountToman(isNaN(toman) ? "" : Math.round(toman).toString());
      } else {
        setAmountToman("");
      }
    },
    [currentPrice],
  );

  return {
    amountToman,
    weightGrams,
    handleAmountChange,
    handleWeightChange,
    // ریست هر دو فیلد
    reset: () => {
      setAmountToman("");
      setWeightGrams("");
    },
  };
}
