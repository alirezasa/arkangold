"use client"
import React, { useState } from "react";
import { useMarketPrice } from "@/app/hooks/useTrading";
import { useWallet } from "@/app/hooks/useWallet";
import { useTradeCalculator } from "@/app/hooks/useTradeCalculator";
import { TradeModal } from "@/app/dashboard/components/trading/TradeModal";

export default function MeltedGoldPage() {
  const [tradeType, setTradeType] = useState<"BUY" | "SELL">("BUY");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // فراخوانی داده‌های بک‌اند
  const { price: marketPriceData, loading: priceLoading } = useMarketPrice();
  const { wallet, loading: walletLoading } = useWallet();

  const currentPrice = marketPriceData?.pricePerGramToman
    ? Number(marketPriceData.pricePerGramToman)
    : null;

  // استفاده از هوک ماشین‌حساب دوطرفه
  const { amountToman, weightGrams, handleAmountChange, handleWeightChange } =
    useTradeCalculator(currentPrice);

  const handleOpenModal = () => {
    if (weightGrams && parseFloat(weightGrams) > 0) {
      setIsModalOpen(true);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      {/* هدر: قیمت لحظه‌ای و موجودی */}
      <div className="bg-white p-4 rounded-lg shadow flex justify-between items-center">
        <div>
          <p className="text-sm text-gray-500">قیمت لحظه‌ای طلا (۱۸ عیار)</p>
          <p className="text-xl font-bold">
            {priceLoading
              ? "در حال بارگذاری..."
              : `${currentPrice?.toLocaleString()} تومان`}
          </p>
        </div>
        <div className="text-left">
          <p className="text-sm text-gray-500">موجودی در دسترس</p>
          <p className="font-medium text-blue-600">
            {walletLoading
              ? "..."
              : `${wallet?.availableRial.toLocaleString()} تومان`}
          </p>
          <p className="font-medium text-yellow-600">
            {walletLoading ? "..." : `${wallet?.availableGrams.toFixed(3)} گرم`}
          </p>
        </div>
      </div>

      {/* فرم خرید و فروش */}
      <div className="bg-white p-6 rounded-lg shadow space-y-6">
        {/* انتخاب نوع معامله */}
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTradeType("BUY")}
            className={`flex-1 py-2 text-center rounded-md transition-colors ${
              tradeType === "BUY"
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            خرید طلا
          </button>
          <button
            onClick={() => setTradeType("SELL")}
            className={`flex-1 py-2 text-center rounded-md transition-colors ${
              tradeType === "SELL"
                ? "bg-red-600 text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            فروش طلا
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              مبلغ ({tradeType === "BUY" ? "پرداختی شما" : "دریافتی شما"})
            </label>
            <div className="relative">
              <input
                type="number"
                value={amountToman}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="مثلاً ۱,۰۰۰,۰۰۰"
                className="w-full border border-gray-300 rounded-md p-3 pl-16 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="absolute left-3 top-3 text-gray-400">تومان</span>
            </div>
          </div>

          <div className="text-center text-gray-400 text-2xl">⇅</div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              وزن طلا
            </label>
            <div className="relative">
              <input
                type="number"
                value={weightGrams}
                onChange={(e) => handleWeightChange(e.target.value)}
                placeholder="مثلاً ۰.۲۵۰"
                step="0.001"
                className="w-full border border-gray-300 rounded-md p-3 pl-16 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="absolute left-3 top-3 text-gray-400">گرم</span>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenModal}
          disabled={
            !weightGrams || parseFloat(weightGrams) <= 0 || priceLoading
          }
          className={`w-full py-3 text-white text-lg font-medium rounded-lg transition-colors ${
            tradeType === "BUY"
              ? "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
              : "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
          }`}
        >
          {tradeType === "BUY" ? "درخواست خرید" : "درخواست فروش"}
        </button>
      </div>

      {/* اتصال مودال */}
      <TradeModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tradeType={tradeType}
        requestedWeightGrams={parseFloat(weightGrams) || 0}
        onSuccess={() => {
          // در صورت نیاز بعد از خرید موفق فیلدها را پاک می‌کنیم
          handleAmountChange("");
        }}
      />
    </div>
  );
}
