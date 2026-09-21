"use client";

import { useCallback, useState } from "react";

function normalizeDigits(val: string): string {
  return val
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^0-9.]/g, "");
}

/**
 * ماشین‌حساب دوطرفه میلی‌گرم ↔ تومان
 * currentPriceToman: قیمت هر گرم طلا به تومان (از API قیمت لحظه‌ای)
 */
export function useGoldMgCalculator(currentPriceToman: number | null) {
  const [weightMg, setWeightMg] = useState("");
  const [amountToman, setAmountToman] = useState("");

  const pricePerMg =
    currentPriceToman && currentPriceToman > 0 ? currentPriceToman / 1000 : null;

  const handleWeightChange = useCallback(
    (val: string) => {
      const normalized = normalizeDigits(val);
      setWeightMg(normalized);

      if (normalized && pricePerMg) {
        const toman = parseFloat(normalized) * pricePerMg;
        setAmountToman(isNaN(toman) ? "" : Math.round(toman).toString());
      } else {
        setAmountToman("");
      }
    },
    [pricePerMg],
  );

  const handleAmountChange = useCallback(
    (val: string) => {
      const normalized = normalizeDigits(val);
      setAmountToman(normalized);

      if (normalized && pricePerMg) {
        const mg = parseFloat(normalized) / pricePerMg;
        setWeightMg(isNaN(mg) ? "" : mg.toFixed(3));
      } else {
        setWeightMg("");
      }
    },
    [pricePerMg],
  );

  const reset = useCallback(() => {
    setWeightMg("");
    setAmountToman("");
  }, []);

  return {
    weightMg,
    amountToman,
    pricePerMg,
    handleWeightChange,
    handleAmountChange,
    reset,
  };
}
