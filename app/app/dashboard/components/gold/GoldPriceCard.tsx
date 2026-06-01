"use client";

import { useGoldPrice } from "@/app/hooks/useGoldPrice";

export default function GoldPriceCard() {
  const { data, loading } = useGoldPrice();

  return (
    <div
      className="relative mx-4 my-4 rounded-xl p-3"
      style={{
        background: "rgba(197,160,89,.15)",
        border: "1px solid rgba(197,160,89,.3)",
      }}
    >
      <p className="text-[10px] text-white/80 mb-1">
        قیمت لحظه‌ای طلا
      </p>

      <p
        className="text-[18px] font-black"
        style={{ color: "var(--color-gold-500)" }}
      >
        {loading
          ? "..."
          : `${Number((data?.price ?? 0) * 1000).toLocaleString("fa-IR")} ت`}
      </p>

      <p
        className={`mt-1 text-[11px] font-bold ${
          (data?.change24h ?? 0) >= 0
            ? "text-emerald-300"
            : "text-red-300"
        }`}
      >
        {(data?.change24h ?? 0) >= 0 ? "↑" : "↓"}{" "}
        {data?.change24h ?? 0}٪ امروز
      </p>
    </div>
  );
}