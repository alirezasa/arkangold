"use client";

import { useState, useCallback } from "react";
import { decimalOnly, digitsOnly } from "@/app/utils/digits";

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
      // پشتیبانی از کیبورد فارسی — مبلغ تومان عدد صحیح است
      const normalized = digitsOnly(val);

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
      // پشتیبانی از کیبورد فارسی (ارقام و جداکننده اعشار «٫»)
      const normalized = decimalOnly(val);

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
