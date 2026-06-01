"use client";

import { useGoldPrice } from "@/app/hooks/useGoldPrice";

export default function GoldPriceMini() {
  const { data } = useGoldPrice();

  return (
    <div className="flex items-center gap-2">
      <span>🟡</span>

      <span className="font-bold">
        {data?.price.toLocaleString("fa-IR")}
      </span>
    </div>
  );
}