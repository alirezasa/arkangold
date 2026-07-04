"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  usePriceLock,
  useCreateOrder,
  useCountdown,
  PriceLockData,
  OrderResult,
} from "@/app/hooks/useTrading";
import { useWallet } from "@/app/hooks/useWallet";
import {
  Timer,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowDownCircle,
  ArrowUpCircle,
  X,
  TrendingDown,
  TrendingUp,
  Coins,
} from "lucide-react";

// ── helper: ریال → تومان نمایشی ──
function rT(rial: number): string {
  const t = rial / 10;
  if (t >= 1_000_000_000)
    return `${(t / 1_000_000_000).toLocaleString("fa-IR")} میلیارد`;
  if (t >= 1_000_000)
    return `${(t / 1_000_000).toLocaleString("fa-IR")} میلیون`;
  return t.toLocaleString("fa-IR");
}

// helper: string یا number رو به عدد تبدیل می‌کنه (مقادیر Decimal از API به‌صورت string میان)
function toNum(val: string | number | undefined | null): number {
  if (val == null) return 0;
  return typeof val === "string" ? parseFloat(val) : val;
}

export type TradeModalProps = {
  open: boolean;
  onClose: () => void;
  tradeType: "BUY" | "SELL";
  requestedWeightGrams: number;
  onSuccess?: () => void;
};

type ModalStep = "locking" | "invoice" | "done";

export function TradeModal({
  open,
  onClose,
  tradeType,
  requestedWeightGrams,
  onSuccess,
}: TradeModalProps) {
  const [step, setStep] = useState<ModalStep>("locking");
  const [orderResult, setOrderResult] = useState<OrderResult | null>(null);

  const {
    loading: lockLoading,
    error: lockError,
    lock,
    lockPrice,
    clearLock,
  } = usePriceLock();

  const {
    loading: orderLoading,
    error: orderError,
    setError: setOrderError,
    createOrder,
  } = useCreateOrder();

  const { wallet, refresh: refreshWallet } = useWallet();

  const {
    remaining,
    formatted: countdown,
    expired,
  } = useCountdown(lock?.expiresAt ?? null);

  // جلوگیری از فراخوانی تکراری با ref
  const lockCalledRef = useRef(false);

  // ── فراخوانی قفل قیمت هنگام باز شدن مودال ──
  useEffect(() => {
    if (!open) {
      lockCalledRef.current = false;
      return;
    }
    if (requestedWeightGrams <= 0) return;
    if (lockCalledRef.current) return;

    lockCalledRef.current = true;
    lockPrice(tradeType, requestedWeightGrams).then((result) => {
      if (result) setStep("invoice");
      else setStep("invoice"); // حتی در صورت خطا به invoice می‌ریم تا پیام نشون داده بشه
    });
  }, [open, requestedWeightGrams, tradeType]);

  // ── برگشت به input هنگام انقضا ──
  useEffect(() => {
    if (expired && step === "invoice") {
      // قفل منقضی شد — کاربر باید دوباره امتحان کنه
      setOrderError("زمان قفل قیمت منقضی شد. لطفاً دوباره امتحان کنید.");
    }
  }, [expired, step]);

  // ── ثبت سفارش ──
  const handleConfirmOrder = async () => {
    if (!lock || expired) return;
    const res = await createOrder(lock.lockId);
    if (res) {
      setOrderResult(res);
      setStep("done");
      refreshWallet();
      onSuccess?.();
    }
  };

  // ── بستن و ریست ──
  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep("locking");
      setOrderResult(null);
      clearLock();
      lockCalledRef.current = false;
    }, 300);
  };

  // ── بررسی موجودی کافی ──
  const totalPayableRial = toNum(lock?.totalPayableRial);
  const totalPayableToman = toNum(lock?.totalPayableToman);
  const lockedPriceToman = toNum(lock?.lockedPriceToman);
  const amountGrams = toNum(lock?.amountGrams);
  const feePercent = toNum(lock?.feePercent);
  const feeToman = toNum(lock?.feeToman);
  const taxToman = toNum(lock?.taxToman);
  const totalToman = toNum(lock?.totalToman);

  const insufficientBalance =
    tradeType === "BUY"
      ? (wallet?.availableRial ?? 0) < totalPayableRial
      : (wallet?.availableGrams ?? 0) < requestedWeightGrams;

  const canConfirm =
    !lockError &&
    !expired &&
    !insufficientBalance &&
    !orderLoading &&
    !!lock &&
    step === "invoice";

  if (!open) return null;

  const isBuy = tradeType === "BUY";
  const accentColor = isBuy ? "var(--color-emerald)" : "#dc2626";
  const accentLight = isBuy ? "var(--color-emerald-light)" : "#fef2f2";

  return (
    // backdrop
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      dir="rtl"
      onClick={handleClose}
    >
      {/* اُورلی */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      {/* پنل اصلی */}
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* نوار رنگی بالا */}
        <div className="h-1" style={{ backgroundColor: accentColor }} />

        {/* هدر */}
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: accentLight }}
            >
              {isBuy ? (
                <ArrowDownCircle
                  className="w-5 h-5"
                  style={{ color: accentColor }}
                />
              ) : (
                <ArrowUpCircle
                  className="w-5 h-5"
                  style={{ color: accentColor }}
                />
              )}
            </div>
            <div>
              <h2 className="text-[15px] font-black text-gray-900">
                پیش‌فاکتور {isBuy ? "خرید" : "فروش"} طلا
              </h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                طلای آبشده ۱۸ عیار
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            disabled={orderLoading}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── مرحله ۱: در حال دریافت قیمت ── */}
        {step === "locking" && (
          <div className="flex flex-col items-center justify-center py-14 gap-4">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ backgroundColor: accentLight }}
            >
              <Loader2
                className="w-7 h-7 animate-spin"
                style={{ color: accentColor }}
              />
            </div>
            <div className="text-center">
              <p className="text-[14px] font-black text-gray-800">
                در حال قفل قیمت لحظه‌ای...
              </p>
              <p className="text-[12px] text-gray-400 mt-1">
                قیمت برای {requestedWeightGrams} گرم قفل می‌شود
              </p>
            </div>
          </div>
        )}

        {/* ── مرحله ۲: پیش‌فاکتور ── */}
        {step === "invoice" && (
          <div className="p-5 space-y-4">
            {/* خطای قفل قیمت */}
            {lockError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {lockError}
              </div>
            )}

            {/* تایمر */}
            {lock && (
              <div
                className={`flex items-center justify-between px-4 py-3 rounded-xl border transition-colors ${
                  remaining <= 15
                    ? "bg-red-50 border-red-200"
                    : remaining <= 30
                      ? "bg-amber-50 border-amber-200"
                      : "bg-green-50 border-green-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Timer
                    className={`w-4 h-4 ${
                      remaining <= 15
                        ? "text-red-500"
                        : remaining <= 30
                          ? "text-amber-500"
                          : "text-green-600"
                    }`}
                  />
                  <span
                    className={`text-[12px] font-bold ${
                      remaining <= 15
                        ? "text-red-700"
                        : remaining <= 30
                          ? "text-amber-700"
                          : "text-green-700"
                    }`}
                  >
                    {expired
                      ? "قیمت قفل‌شده منقضی شد"
                      : "زمان باقیمانده قفل قیمت"}
                  </span>
                </div>
                {!expired && (
                  <span
                    className={`text-[20px] font-black tabular-nums ${
                      remaining <= 15
                        ? "text-red-600 animate-pulse"
                        : remaining <= 30
                          ? "text-amber-600"
                          : "text-green-700"
                    }`}
                    dir="ltr"
                  >
                    {countdown}
                  </span>
                )}
              </div>
            )}

            {/* جزئیات سفارش */}
            {lock && (
              <div
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--color-border)" }}
              >
                {/* هدر جدول */}
                <div
                  className="flex items-center gap-2 px-4 py-3"
                  style={{ backgroundColor: accentLight }}
                >
                  <Coins className="w-4 h-4" style={{ color: accentColor }} />
                  <span
                    className="text-[13px] font-black"
                    style={{ color: accentColor }}
                  >
                    جزئیات معامله
                  </span>
                </div>

                {/* ردیف‌های اطلاعات */}
                {[
                  {
                    label: "مقدار طلا",
                    value: `${amountGrams} گرم`,
                    highlight: false,
                  },
                  {
                    label: "قیمت قفل‌شده هر گرم",
                    value: `${lockedPriceToman.toLocaleString("fa-IR")} تومان`,
                    highlight: false,
                  },
                  {
                    label: "ارزش طلا",
                    value: `${totalToman.toLocaleString("fa-IR")} تومان`,
                    highlight: false,
                  },
                  {
                    label: `کارمزد (${feePercent}٪)`,
                    value: `${feeToman.toLocaleString("fa-IR")} تومان`,
                    highlight: false,
                  },
                  ...(taxToman > 0
                    ? [
                        {
                          label: "مالیات",
                          value: `${taxToman.toLocaleString("fa-IR")} تومان`,
                          highlight: false,
                        },
                      ]
                    : []),
                  {
                    label: isBuy ? "مبلغ پرداختی" : "مبلغ دریافتی",
                    value: `${totalPayableToman.toLocaleString("fa-IR")} تومان`,
                    highlight: true,
                  },
                ].map((row, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-4 py-3.5 border-t ${
                      row.highlight ? "bg-gray-50" : "bg-white"
                    }`}
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <span className="text-[12px] text-gray-500 font-medium">
                      {row.label}
                    </span>
                    <span
                      className={
                        row.highlight
                          ? "text-[17px] font-black text-gray-900"
                          : "text-[13px] font-bold text-gray-700"
                      }
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* موجودی کافی نیست */}
            {insufficientBalance && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-[12px] font-bold">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {isBuy
                  ? `موجودی ریال کافی نیست. موجودی قابل استفاده: ${rT(wallet?.availableRial ?? 0)} تومان`
                  : `موجودی طلا کافی نیست. موجودی قابل استفاده: ${wallet?.availableGrams.toFixed(4) ?? "0"} گرم`}
              </div>
            )}

            {/* خطای ثبت سفارش */}
            {orderError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                {orderError}
              </div>
            )}

            {/* دکمه‌ها */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleClose}
                disabled={orderLoading}
                className="flex-1 py-3.5 rounded-xl font-bold text-[13px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmOrder}
                disabled={!canConfirm}
                className="flex-[2] py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{
                  backgroundColor: canConfirm ? accentColor : "#9ca3af",
                  boxShadow: canConfirm
                    ? isBuy
                      ? "0 4px 14px rgba(51,5,9,.3)"
                      : "0 4px 14px rgba(220,38,38,.3)"
                    : "none",
                }}
              >
                {orderLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : isBuy ? (
                  <>
                    <ArrowDownCircle className="w-4 h-4" />
                    تایید و خرید
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="w-4 h-4" />
                    تایید و فروش
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── مرحله ۳: موفقیت ── */}
        {step === "done" && orderResult && (
          <div className="p-6 flex flex-col items-center text-center gap-4">
            {/* آیکون تیک */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ backgroundColor: accentLight }}
            >
              <CheckCircle2
                className="w-9 h-9"
                style={{ color: accentColor }}
              />
            </div>

            <div>
              <h3 className="text-[18px] font-black text-gray-900 mb-1">
                {isBuy ? "خرید با موفقیت انجام شد" : "فروش با موفقیت انجام شد"}
              </h3>
              <p className="text-[13px] text-gray-500">
                {toNum(orderResult.amountGrams)} گرم طلا{" "}
                {isBuy ? "به موجودی شما اضافه شد" : "از موجودی شما کسر شد"}
              </p>
            </div>

            {/* جزئیات خلاصه */}
            <div
              className="w-full rounded-xl overflow-hidden border"
              style={{ borderColor: "var(--color-border)" }}
            >
              {[
                {
                  label: "مقدار",
                  value: `${toNum(orderResult.amountGrams)} گرم`,
                },
                {
                  label: "قیمت هر گرم",
                  value: `${toNum(orderResult.pricePerGramToman).toLocaleString("fa-IR")} تومان`,
                },
                {
                  label: isBuy ? "مبلغ پرداخت شد" : "مبلغ دریافت شد",
                  value: `${toNum(orderResult.totalToman).toLocaleString("fa-IR")} تومان`,
                },
                {
                  label: "کارمزد",
                  value: `${toNum(orderResult.feeToman).toLocaleString("fa-IR")} تومان`,
                },
              ].map((row, i) => (
                <div
                  key={i}
                  className={`flex justify-between px-4 py-3 text-right ${
                    i > 0 ? "border-t" : ""
                  }`}
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor:
                      i % 2 === 0 ? "var(--color-bg-page)" : "white",
                  }}
                >
                  <span className="text-[12px] text-gray-500">{row.label}</span>
                  <span className="text-[13px] font-black text-gray-800">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {/* موجودی جدید */}
            {wallet && (
              <div
                className="w-full flex items-center justify-around py-3 rounded-xl"
                style={{ backgroundColor: accentLight }}
              >
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 mb-0.5">موجودی طلا</p>
                  <p
                    className="text-[15px] font-black"
                    style={{ color: accentColor }}
                  >
                    {wallet.goldBalanceGrams.toFixed(4)}
                    <span className="text-[10px] font-normal mr-0.5">گرم</span>
                  </p>
                </div>
                <div className="w-px h-8 bg-gray-200" />
                <div className="text-center">
                  <p className="text-[10px] text-gray-500 mb-0.5">
                    موجودی ریال
                  </p>
                  <p
                    className="text-[15px] font-black"
                    style={{ color: accentColor }}
                  >
                    {rT(wallet.rialBalance)}
                    <span className="text-[10px] font-normal mr-0.5">
                      تومان
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* دکمه بستن */}
            <button
              onClick={handleClose}
              className="w-full py-3.5 rounded-xl font-black text-white text-[14px] transition-all"
              style={{
                backgroundColor: accentColor,
                boxShadow: isBuy
                  ? "0 4px 14px rgba(51,5,9,.3)"
                  : "0 4px 14px rgba(220,38,38,.3)",
              }}
            >
              بستن
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
