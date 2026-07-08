"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  usePriceLock,
  useCreateOrder,
  useCountdown,
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
  Info,
} from "lucide-react";

// ── helper: ریال → تومان نمایشی (بدون اعشار، خوانا) ──
function rT(rial: number): string {
  const t = rial / 10;
  if (t >= 1_000_000_000)
    return `${(t / 1_000_000_000).toLocaleString("fa-IR")} میلیارد`;
  if (t >= 1_000_000)
    return `${(t / 1_000_000).toLocaleString("fa-IR")} میلیون`;
  return Math.round(t).toLocaleString("fa-IR");
}

function toNum(val: string | number | undefined | null): number {
  if (val == null) return 0;
  const n = typeof val === "string" ? parseFloat(val) : val;
  return Number.isFinite(n) ? n : 0;
}

function fmtToman(val: string | number | undefined | null): string {
  return Math.round(toNum(val)).toLocaleString("fa-IR");
}

function fmtGrams(val: string | number | undefined | null): string {
  const n = toNum(val);
  return n.toLocaleString("fa-IR", { maximumFractionDigits: 4 });
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

  const lockCalledRef = useRef(false);

  useEffect(() => {
    if (!open) {
      lockCalledRef.current = false;
      setStep("locking");
      return;
    }
    if (requestedWeightGrams <= 0) return;
    if (lockCalledRef.current) return;

    lockCalledRef.current = true;
    lockPrice(tradeType, requestedWeightGrams).then(() => {
      setStep("invoice");
    });
  }, [open, requestedWeightGrams, tradeType]);

  useEffect(() => {
    if (expired && step === "invoice") {
      setOrderError("زمان قفل قیمت منقضی شد. لطفاً دوباره امتحان کنید.");
    }
  }, [expired, step]);

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

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setStep("locking");
      setOrderResult(null);
      clearLock();
      lockCalledRef.current = false;
    }, 300);
  };

  const totalPayableRial = toNum(lock?.totalPayableRial);

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

  const showSkeleton =
    step === "locking" || (step === "invoice" && lockLoading && !lock);

  if (!open) return null;

  const isBuy = tradeType === "BUY";
  const accentColor = isBuy ? "var(--color-emerald)" : "#dc2626";
  const accentLight = isBuy ? "var(--color-emerald-light)" : "#fef2f2";

  return (
    <div
      /* اصلاح هشدار تیل‌ویند: استفاده از z-200 به جای z-[200] */
      className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-0 sm:p-4"
      dir="rtl"
      onClick={handleClose}
    >
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ backgroundColor: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" />
        </div>

        <div
          className="h-1 shrink-0 hidden sm:block"
          style={{ backgroundColor: accentColor }}
        />

        <div
          className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
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
              <h2 className="text-[14px] sm:text-[15px] font-black text-gray-900">
                پیش‌فاکتور {isBuy ? "خرید" : "فروش"} طلا
              </h2>
              <p className="text-[10px] sm:text-[11px] text-gray-400 mt-0.5">
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

        <div className="overflow-y-auto">
          {/* اصلاح خطای تایپ‌اسکریپت: حذف step !== "done" */}
          {showSkeleton && (
            <div className="p-4 sm:p-5 space-y-3.5 animate-pulse">
              <div className="h-11 rounded-xl bg-gray-100" />
              <div
                className="rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--color-border)" }}
              >
                <div
                  className="h-10"
                  style={{ backgroundColor: accentLight }}
                />
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-4 py-3.5 border-t bg-white"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <div className="h-3 w-20 rounded bg-gray-100" />
                    <div className="h-3 w-24 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="flex-1 h-12 rounded-xl bg-gray-100" />
                {/* اصلاح هشدار تیل‌ویند: استفاده از flex-2 به جای flex-[2] */}
                <div className="flex-2 h-12 rounded-xl bg-gray-100" />
              </div>
            </div>
          )}

          {step === "invoice" && !showSkeleton && (
            <div className="p-4 sm:p-5 space-y-3.5">
              {lockError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {lockError}
                </div>
              )}

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
                      className={`text-[11px] sm:text-[12px] font-bold ${
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
                      className={`text-[18px] sm:text-[20px] font-black tabular-nums ${
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

              {lock && (
                <div
                  className="rounded-xl overflow-hidden border"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div
                    className="flex items-center gap-2 px-4 py-2.5 sm:py-3"
                    style={{ backgroundColor: accentLight }}
                  >
                    <Coins
                      className="w-4 h-4 shrink-0"
                      style={{ color: accentColor }}
                    />
                    <span
                      className="text-[12px] sm:text-[13px] font-black"
                      style={{ color: accentColor }}
                    >
                      جزئیات معامله
                    </span>
                  </div>

                  {[
                    {
                      label: "مقدار طلا",
                      value: `${fmtGrams(lock.amountGrams)} گرم`,
                      highlight: false,
                    },
                    {
                      label: "قیمت قفل‌شده هر گرم",
                      value: `${fmtToman(lock.lockedPriceToman)} تومان`,
                      highlight: false,
                    },
                    {
                      label: "ارزش طلا",
                      value: `${fmtToman(lock.totalToman)} تومان`,
                      highlight: false,
                    },
                    {
                      label: `کارمزد (${toNum(lock.feePercent)}٪)`,
                      value: `${fmtToman(lock.feeToman)} تومان`,
                      highlight: false,
                    },
                    ...(toNum(lock.taxToman) > 0
                      ? [
                          {
                            label: "مالیات",
                            value: `${fmtToman(lock.taxToman)} تومان`,
                            highlight: false,
                          },
                        ]
                      : []),
                    {
                      label: isBuy ? "مبلغ پرداختی" : "مبلغ دریافتی",
                      value: `${fmtToman(lock.totalPayableToman)} تومان`,
                      highlight: true,
                    },
                  ].map((row, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-3 px-4 py-3 sm:py-3.5 border-t ${
                        row.highlight ? "bg-gray-50" : "bg-white"
                      }`}
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      <span className="text-[11px] sm:text-[12px] text-gray-500 font-medium shrink-0">
                        {row.label}
                      </span>
                      <span
                        className={
                          row.highlight
                            ? "text-[15px] sm:text-[17px] font-black text-gray-900 tabular-nums"
                            : "text-[12px] sm:text-[13px] font-bold text-gray-700 tabular-nums"
                        }
                      >
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {lock && (
                <div className="flex items-start gap-2 px-1 text-[10px] sm:text-[11px] text-gray-400 leading-relaxed">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <p>
                    قیمت قفل‌شده شامل اسپرد استاندارد معاملاتی (خرید بالاتر،
                    فروش پایین‌تر از قیمت لحظه‌ای بازار) است؛ به همین دلیل با
                    قیمت نمایش داده‌شده در صفحه اصلی کمی تفاوت دارد.
                  </p>
                </div>
              )}

              {insufficientBalance && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-[11px] sm:text-[12px] font-bold">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {isBuy
                    ? `موجودی ریال کافی نیست. موجودی قابل استفاده: ${rT(wallet?.availableRial ?? 0)} تومان`
                    : `موجودی طلا کافی نیست. موجودی قابل استفاده: ${wallet?.availableGrams.toFixed(4) ?? "0"} گرم`}
                </div>
              )}

              {orderError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-[13px] font-bold">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  {orderError}
                </div>
              )}
            </div>
          )}

          {step === "done" && orderResult && (
            <div className="p-5 sm:p-6 flex flex-col items-center text-center gap-4">
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
                <h3 className="text-[16px] sm:text-[18px] font-black text-gray-900 mb-1">
                  {isBuy
                    ? "خرید با موفقیت انجام شد"
                    : "فروش با موفقیت انجام شد"}
                </h3>
                <p className="text-[12px] sm:text-[13px] text-gray-500">
                  {fmtGrams(orderResult.amountGrams)} گرم طلا{" "}
                  {isBuy ? "به موجودی شما اضافه شد" : "از موجودی شما کسر شد"}
                </p>
              </div>

              <div
                className="w-full rounded-xl overflow-hidden border"
                style={{ borderColor: "var(--color-border)" }}
              >
                {[
                  {
                    label: "مقدار",
                    value: `${fmtGrams(orderResult.amountGrams)} گرم`,
                  },
                  {
                    label: "قیمت هر گرم",
                    value: `${fmtToman(orderResult.pricePerGramToman)} تومان`,
                  },
                  {
                    label: isBuy ? "مبلغ پرداخت شد" : "مبلغ دریافت شد",
                    value: `${fmtToman(orderResult.totalToman)} تومان`,
                  },
                  {
                    label: "کارمزد",
                    value: `${fmtToman(orderResult.feeToman)} تومان`,
                  },
                ].map((row, i) => (
                  <div
                    key={i}
                    className={`flex justify-between gap-3 px-4 py-3 text-right ${
                      i > 0 ? "border-t" : ""
                    }`}
                    style={{
                      borderColor: "var(--color-border)",
                      backgroundColor:
                        i % 2 === 0 ? "var(--color-bg-page)" : "white",
                    }}
                  >
                    <span className="text-[11px] sm:text-[12px] text-gray-500 shrink-0">
                      {row.label}
                    </span>
                    <span className="text-[12px] sm:text-[13px] font-black text-gray-800 tabular-nums">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              {wallet && (
                <div
                  className="w-full flex items-center justify-around py-3 rounded-xl"
                  style={{ backgroundColor: accentLight }}
                >
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 mb-0.5">
                      موجودی طلا
                    </p>
                    <p
                      className="text-[14px] sm:text-[15px] font-black"
                      style={{ color: accentColor }}
                    >
                      {wallet.goldBalanceGrams.toFixed(4)}
                      <span className="text-[10px] font-normal mr-0.5">
                        گرم
                      </span>
                    </p>
                  </div>
                  <div className="w-px h-8 bg-gray-200" />
                  <div className="text-center">
                    <p className="text-[10px] text-gray-500 mb-0.5">
                      موجودی ریال
                    </p>
                    <p
                      className="text-[14px] sm:text-[15px] font-black"
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
            </div>
          )}
        </div>

        {step === "invoice" && !showSkeleton && (
          <div
            className="flex gap-3 p-4 sm:p-5 pt-3 border-t shrink-0"
            style={{ borderColor: "var(--color-border)" }}
          >
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
              /* اصلاح هشدار تیل‌ویند: استفاده از flex-2 به جای flex-[2] */
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40"
              style={{
                background: canConfirm
                  ? isBuy
                    ? "linear-gradient(135deg, var(--color-emerald), #4a0d13)"
                    : "linear-gradient(135deg, #dc2626, #8f1d1d)"
                  : "#9ca3af",
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
        )}

        {step === "done" && orderResult && (
          <div className="p-4 sm:p-5 pt-0 shrink-0">
            <button
              onClick={handleClose}
              className="w-full py-3.5 rounded-xl font-black text-white text-[14px] transition-all"
              style={{
                background: isBuy
                  ? "linear-gradient(135deg, var(--color-emerald), #4a0d13)"
                  : "linear-gradient(135deg, #dc2626, #8f1d1d)",
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
