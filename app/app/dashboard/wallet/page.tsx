"use client";

import { useState, useCallback } from "react";
import {
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  History,
  Info,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  Banknote,
  Coins,
  TrendingUp,
  TrendingDown,
  CreditCard,
  Building2,
} from "lucide-react";
import {
  useWallet,
  useTransactions,
  useLimitsGuide,
  type Transaction,
} from "@/app/hooks/useWallet";
import {
  useWithdrawals,
  useWithdrawalActions,
} from "@/app/hooks/useWithdrawal";
import { useBankAccounts } from "@/app/hooks/useBankAccounts";

// ── تب‌های صفحه ──
type Tab = "overview" | "deposit" | "withdraw" | "history";

// ── برچسب نوع تراکنش ──
const TX_LABELS: Record<
  string,
  { label: string; color: string; icon: string }
> = {
  DEPOSIT: { label: "واریز", color: "text-green-600", icon: "↓" },
  WITHDRAWAL: { label: "برداشت", color: "text-red-500", icon: "↑" },
  BUY_GOLD: { label: "خرید طلا", color: "text-amber-600", icon: "🥇" },
  SELL_GOLD: { label: "فروش طلا", color: "text-blue-600", icon: "💰" },
  BUY_SILVER: { label: "خرید نقره", color: "text-slate-600", icon: "🥈" },
  SELL_SILVER: { label: "فروش نقره", color: "text-blue-400", icon: "💵" },
  TRANSFER_IN: { label: "انتقال دریافتی", color: "text-green-500", icon: "←" },
  TRANSFER_OUT: { label: "انتقال ارسالی", color: "text-orange-500", icon: "→" },
  FEE: { label: "کارمزد", color: "text-gray-500", icon: "📋" },
  TAX: { label: "مالیات", color: "text-gray-500", icon: "🏛" },
  REFERRAL_REWARD: {
    label: "جایزه معرف",
    color: "text-purple-500",
    icon: "🎁",
  },
  SALARY: { label: "حقوق", color: "text-green-600", icon: "💼" },
  PHYSICAL_DELIVERY: {
    label: "تحویل فیزیکی",
    color: "text-brown-500",
    icon: "📦",
  },
  SHOP_PURCHASE: { label: "خرید فروشگاه", color: "text-pink-500", icon: "🛍" },
  REFUND: { label: "استرداد", color: "text-green-500", icon: "↩" },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  COMPLETED: { label: "تکمیل شده", color: "text-green-600" },
  PENDING: { label: "در انتظار", color: "text-amber-500" },
  FAILED: { label: "ناموفق", color: "text-red-500" },
};

// ── کامپوننت کپی ──
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
    >
      {copied ? (
        <CheckCircle2 className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
}

// ── بخش موجودی ──
function OverviewTab() {
  const { wallet, loading, error } = useWallet();

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--color-emerald)" }}
        />
      </div>
    );

  if (error || !wallet)
    return (
      <div className="text-center py-12 text-red-500 font-bold">{error}</div>
    );

  return (
    <div className="space-y-4">
      {/* کارت اصلی */}
      <div
        className="rounded-2xl p-6 text-white relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--color-emerald) 0%, #1a0a0c 100%)",
        }}
      >
        <div
          className="absolute -top-8 -left-8 w-32 h-32 rounded-full opacity-10"
          style={{ background: "var(--color-gold-500)" }}
        />
        <div
          className="absolute -bottom-6 -right-6 w-24 h-24 rounded-full opacity-10"
          style={{ background: "var(--color-gold-500)" }}
        />

        <div className="relative z-10">
          <p className="text-white/60 text-[12px] font-bold mb-1">
            شماره کارت مجازی
          </p>
          <div className="flex items-center gap-2 mb-6">
            <p className="text-[16px] font-bold tracking-widest" dir="ltr">
              {wallet.cardNumber.replace(/(\d{4})/g, "$1 ").trim()}
            </p>
            <CopyButton text={wallet.cardNumber} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-white/60 text-[11px] font-bold mb-1">
                موجودی ریالی
              </p>
              <p className="text-[20px] font-black">
                {wallet.availableRial.toLocaleString("fa-IR")}
                <span className="text-[12px] font-bold opacity-70 mr-1">
                  تومان
                </span>
              </p>
              {wallet.frozenRial > 0 && (
                <p className="text-[11px] text-white/50 mt-0.5 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {wallet.frozenRial.toLocaleString("fa-IR")} مسدود
                </p>
              )}
            </div>
            <div>
              <p className="text-white/60 text-[11px] font-bold mb-1">
                موجودی طلا
              </p>
              <p
                className="text-[20px] font-black"
                style={{ color: "var(--color-gold-500)" }}
              >
                {wallet.availableGrams.toFixed(4)}
                <span className="text-[12px] font-bold opacity-70 mr-1">
                  گرم
                </span>
              </p>
              {wallet.frozenGrams > 0 && (
                <p className="text-[11px] text-white/50 mt-0.5 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {wallet.frozenGrams} گرم مسدود
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* موجودی کل */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Banknote className="w-4 h-4 text-green-500" />
            <p className="text-[12px] font-bold text-gray-500">کل ریالی</p>
          </div>
          <p className="text-[16px] font-black text-gray-800">
            {wallet.rialBalance.toLocaleString("fa-IR")}
            <span className="text-[11px] text-gray-400 mr-1">ت</span>
          </p>
        </div>
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Coins className="w-4 h-4 text-amber-500" />
            <p className="text-[12px] font-bold text-gray-500">کل طلا</p>
          </div>
          <p className="text-[16px] font-black text-gray-800">
            {wallet.goldBalanceGrams.toFixed(4)}
            <span className="text-[11px] text-gray-400 mr-1">گرم</span>
          </p>
        </div>
      </div>

      {/* holds فعال */}
      {wallet.holds.length > 0 && (
        <div className="rounded-2xl p-4 bg-amber-50 border border-amber-100">
          <div className="flex items-center gap-2 mb-3">
            <Lock className="w-4 h-4 text-amber-500" />
            <p className="text-[13px] font-black text-amber-800">
              موجودی مسدود
            </p>
          </div>
          <div className="space-y-2">
            {wallet.holds.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="text-amber-700 font-bold">
                  {h.type === "WITHDRAWAL"
                    ? "درخواست برداشت"
                    : h.type === "ORDER"
                      ? "سفارش معاملاتی"
                      : "تحویل فیزیکی"}
                </span>
                <span className="text-amber-800 font-black">
                  {h.amountRial
                    ? `${h.amountRial.toLocaleString("fa-IR")} ت`
                    : `${h.amountGrams} گرم`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── بخش واریز ──
function DepositTab() {
  const { limits, loading } = useLimitsGuide();
  const [method, setMethod] = useState<"gateway" | "sheba">("gateway");
  const [shebaVisible, setShebaVisible] = useState(false);

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "var(--color-emerald)" }}
        />
      </div>
    );

  if (!limits) return null;

  return (
    <div className="space-y-4">
      {/* انتخاب روش */}
      <div className="flex bg-gray-100 p-1.5 rounded-2xl border border-gray-200">
        <button
          onClick={() => setMethod("gateway")}
          className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all ${
            method === "gateway"
              ? "bg-white shadow-sm text-gray-800"
              : "text-gray-500"
          }`}
        >
          درگاه پرداخت
        </button>
        <button
          onClick={() => setMethod("sheba")}
          className={`flex-1 py-3 rounded-xl text-[13px] font-bold transition-all ${
            method === "sheba"
              ? "bg-white shadow-sm text-gray-800"
              : "text-gray-500"
          }`}
        >
          واریز با شبا
        </button>
      </div>

      {/* واریز درگاه */}
      {method === "gateway" && (
        <div className="space-y-4">
          {/* سقف‌ها */}
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <p className="text-[13px] font-black text-gray-800 mb-3">
              محدودیت‌های واریز درگاه
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 rounded-xl p-3 border border-green-100">
                <p className="text-[11px] text-green-600 font-bold mb-1">
                  حداقل واریز
                </p>
                <p className="text-[15px] font-black text-green-800">
                  {limits.deposit.gateway.minFormatted}
                  <span className="text-[11px] mr-1">تومان</span>
                </p>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                <p className="text-[11px] text-blue-600 font-bold mb-1">
                  سقف واریز
                </p>
                <p className="text-[15px] font-black text-blue-800">
                  {limits.deposit.gateway.maxFormatted}
                  <span className="text-[11px] mr-1">تومان</span>
                </p>
              </div>
            </div>
          </div>

          {/* نکات */}
          <div className="rounded-2xl p-4 bg-amber-50 border border-amber-100">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-amber-600" />
              <p className="text-[13px] font-black text-amber-800">نکات مهم</p>
            </div>
            <ul className="space-y-2">
              {limits.deposit.gateway.notes.map((note, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[12px] text-amber-700 font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </div>

          <button
            className="w-full py-4 rounded-2xl font-black text-white text-[14px] flex items-center justify-center gap-2"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <ArrowDownCircle className="w-5 h-5" />
            ورود به درگاه پرداخت
          </button>
        </div>
      )}

      {/* واریز شبا */}
      {method === "sheba" && (
        <div className="space-y-4">
          {/* راهنمای گام‌به‌گام */}
          <div
            className="rounded-2xl p-5"
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
            }}
          >
            <p className="text-[13px] font-black text-gray-800 mb-4">
              مراحل واریز مستقیم
            </p>
            <div className="space-y-4">
              {[
                "مطمئن شوید کارت بانکی تایید‌شده در پنل ثبت کرده‌اید",
                "مبلغ مورد نظر را به شبای پلتفرم واریز کنید",
                "در بخش «بابت» گزینه «امور سرمایه‌گذاری و بورس» را انتخاب کنید",
                "پس از پردازش پایا (تا یک روز کاری) موجودی شارژ می‌شود",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5"
                    style={{
                      backgroundColor: "var(--color-emerald-light)",
                      color: "var(--color-emerald)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <p className="text-[13px] text-gray-600 font-medium leading-relaxed">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* نمایش شبا */}
          {!shebaVisible ? (
            <div className="space-y-3">
              <div className="rounded-xl p-4 bg-red-50 border border-red-100">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    {limits.deposit.sheba.notes.map((note, i) => (
                      <p
                        key={i}
                        className="text-[12px] text-red-700 font-medium"
                      >
                        {note}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShebaVisible(true)}
                className="w-full py-4 rounded-2xl font-black text-white text-[14px] flex items-center justify-center gap-2"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                <Building2 className="w-5 h-5" />
                نمایش اطلاعات حساب مقصد
              </button>
            </div>
          ) : (
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "2px solid var(--color-gold-500)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <p className="text-[13px] font-black text-gray-800">
                  اطلاعات حساب مقصد
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-[11px] text-gray-400 font-bold mb-0.5">
                      نام بانک
                    </p>
                    <p className="text-[14px] font-black text-gray-800">
                      {limits.deposit.sheba.platformBank}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-gray-400 font-bold mb-0.5">
                      شماره شبا
                    </p>
                    <p
                      className="text-[13px] font-black text-gray-800 font-mono"
                      dir="ltr"
                    >
                      {limits.deposit.sheba.platformSheba}
                    </p>
                  </div>
                  <CopyButton text={limits.deposit.sheba.platformSheba} />
                </div>
              </div>

              <p className="text-[11px] text-amber-700 bg-amber-50 p-3 rounded-xl border border-amber-100">
                ⚠️ {limits.deposit.sheba.warning}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── بخش برداشت ──
function WithdrawTab({ onSuccess }: { onSuccess: () => void }) {
  const { limits } = useLimitsGuide();
  const { accounts } = useBankAccounts();
  const { withdrawals, refetch } = useWithdrawals();
  const { loading, error, setError, requestWithdrawal, cancelWithdrawal } =
    useWithdrawalActions(() => {
      refetch();
      onSuccess();
    });

  const [amount, setAmount] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [result, setResult] = useState<{
    message: string;
    needsTwoApprovals: boolean;
    estimatedTime: string;
  } | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const verifiedAccounts = accounts.filter((a) => a.isVerified);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return setError("لطفاً یک حساب بانکی انتخاب کنید");
    const amountNum = Number(amount.replace(/,/g, ""));
    if (!amountNum || amountNum <= 0) return setError("مبلغ معتبر وارد کنید");

    const res = await requestWithdrawal(amountNum, selectedAccount);
    if (res) {
      setResult(res);
      setAmount("");
      setSelectedAccount("");
    }
  };

  const handleCancel = async (id: string) => {
    setCancelling(id);
    await cancelWithdrawal(id);
    setCancelling(null);
  };

  if (result) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <CheckCircle2 className="w-16 h-16 text-green-500" />
        <h3 className="text-[16px] font-black text-gray-800">درخواست ثبت شد</h3>
        <p className="text-[13px] text-gray-500 leading-relaxed max-w-xs">
          {result.message}
        </p>
        {result.needsTwoApprovals && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl text-[12px] text-amber-700 font-bold">
            <Info className="w-4 h-4 shrink-0" />
            نیاز به تایید دو کارشناس
          </div>
        )}
        <p className="text-[12px] text-gray-400">{result.estimatedTime}</p>
        <button
          onClick={() => setResult(null)}
          className="mt-2 px-6 py-2.5 rounded-xl text-[13px] font-bold text-white"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          درخواست جدید
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* سقف‌های برداشت */}
      {limits && (
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-surface)",
            border: "1px solid var(--color-border)",
          }}
        >
          <p className="text-[13px] font-black text-gray-800 mb-3">
            وضعیت برداشت ماهانه
          </p>
          <div className="space-y-3">
            {/* progress bar */}
            <div>
              <div className="flex justify-between text-[11px] font-bold text-gray-500 mb-1.5">
                <span>
                  مصرف شده: {limits.withdrawal.monthlyUsedFormatted} ت
                </span>
                <span>سقف: {limits.withdrawal.monthlyLimitFormatted} ت</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (limits.withdrawal.monthlyUsed / limits.withdrawal.monthlyLimit) * 100)}%`,
                    backgroundColor:
                      limits.withdrawal.monthlyUsed /
                        limits.withdrawal.monthlyLimit >
                      0.8
                        ? "#ef4444"
                        : "var(--color-emerald)",
                  }}
                />
              </div>
              <p className="text-[11px] text-green-600 font-bold mt-1">
                باقی‌مانده: {limits.withdrawal.monthlyRemainingFormatted} تومان
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-xl p-2.5">
                <p className="text-[10px] text-gray-400 font-bold">
                  حداقل برداشت
                </p>
                <p className="text-[13px] font-black text-gray-700">
                  {limits.withdrawal.minFormatted} ت
                </p>
              </div>
              <div className="bg-amber-50 rounded-xl p-2.5">
                <p className="text-[10px] text-amber-600 font-bold">
                  آستانه تایید دوگانه
                </p>
                <p className="text-[13px] font-black text-amber-700">
                  {limits.withdrawal.approvalThresholdFormatted} ت
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* فرم */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-[13px] font-bold text-red-600 bg-red-50 border border-red-100">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {error}
          </div>
        )}

        {/* مبلغ */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            مبلغ برداشت (تومان)
          </label>
          <input
            type="tel"
            dir="ltr"
            placeholder="مثلاً ۵۰۰,۰۰۰"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/\D/g, ""));
              if (error) setError(null);
            }}
            className="w-full px-4 py-3 rounded-xl text-[15px] font-bold border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left"
          />
          {amount && (
            <p className="text-[11px] text-gray-400 font-bold">
              {Number(amount).toLocaleString("fa-IR")} تومان
            </p>
          )}
        </div>

        {/* انتخاب حساب بانکی */}
        <div className="space-y-1.5">
          <label className="text-[12px] font-bold text-gray-500">
            حساب بانکی مقصد
          </label>
          {verifiedAccounts.length === 0 ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-[13px] text-red-600 font-medium">
              هیچ حساب بانکی تایید‌شده‌ای ندارید. ابتدا از بخش «کارت‌های بانکی»
              حساب اضافه کنید.
            </div>
          ) : (
            <div className="space-y-2">
              {verifiedAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelectedAccount(acc.id)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-right ${
                    selectedAccount === acc.id
                      ? "border-gold-500 bg-amber-50"
                      : "border-gray-100 bg-white hover:border-gray-200"
                  }`}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "var(--color-bg-page)" }}
                  >
                    <CreditCard className="w-4 h-4 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-gray-800">
                      {acc.bankName}
                    </p>
                    <p
                      className="text-[11px] text-gray-400 font-mono"
                      dir="ltr"
                    >
                      **** {acc.cardLast4}
                    </p>
                  </div>
                  {selectedAccount === acc.id && (
                    <CheckCircle2
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--color-gold-500)" }}
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* نکات */}
        {limits && (
          <div className="rounded-xl p-3 bg-blue-50 border border-blue-100">
            <ul className="space-y-1">
              {limits.withdrawal.notes.map((note, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[11px] text-blue-700 font-medium"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || verifiedAccounts.length === 0}
          className="w-full py-4 rounded-2xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-60"
          style={{ backgroundColor: "var(--color-emerald)" }}
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <ArrowUpCircle className="w-5 h-5" /> ثبت درخواست برداشت
            </>
          )}
        </button>
      </form>

      {/* درخواست‌های قبلی */}
      {withdrawals.length > 0 && (
        <div className="space-y-3">
          <p className="text-[13px] font-black text-gray-700">
            درخواست‌های اخیر
          </p>
          {withdrawals.map((w) => (
            <div
              key={w.id}
              className="flex items-center gap-3 p-4 rounded-2xl"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-[14px] font-black text-gray-800">
                    {w.amountRialFormatted} تومان
                  </p>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      w.status === "PENDING"
                        ? "bg-amber-100 text-amber-700"
                        : w.status === "PROCESSED"
                          ? "bg-green-100 text-green-700"
                          : w.status === "REJECTED"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {w.statusLabel}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">
                  {w.bankName} — *{w.cardLast4}
                </p>
              </div>
              {w.canCancel && (
                <button
                  onClick={() => handleCancel(w.id)}
                  disabled={cancelling === w.id}
                  className="p-2 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  {cancelling === w.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── بخش تاریخچه ──
function HistoryTab() {
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState<string>("");
  const { transactions, meta, loading, error } = useTransactions(
    page,
    20,
    filterType || undefined,
  );

  const TX_TYPES = Object.entries(TX_LABELS).map(([k, v]) => ({
    key: k,
    label: v.label,
  }));

  return (
    <div className="space-y-4">
      {/* فیلتر */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => {
            setFilterType("");
            setPage(1);
          }}
          className={`px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
            !filterType ? "text-white" : "bg-gray-100 text-gray-600"
          }`}
          style={!filterType ? { backgroundColor: "var(--color-emerald)" } : {}}
        >
          همه
        </button>
        {["DEPOSIT", "WITHDRAWAL", "BUY_GOLD", "SELL_GOLD"].map((t) => (
          <button
            key={t}
            onClick={() => {
              setFilterType(t);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded-xl text-[12px] font-bold whitespace-nowrap transition-all ${
              filterType === t ? "text-white" : "bg-gray-100 text-gray-600"
            }`}
            style={
              filterType === t
                ? { backgroundColor: "var(--color-emerald)" }
                : {}
            }
          >
            {TX_LABELS[t]?.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: "var(--color-emerald)" }}
          />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500 font-bold">{error}</div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center py-16 gap-3 text-center">
          <History className="w-12 h-12 text-gray-200" />
          <p className="text-[14px] font-bold text-gray-400">
            تراکنشی یافت نشد
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {transactions.map((tx) => {
              const info = TX_LABELS[tx.type] ?? {
                label: tx.type,
                color: "text-gray-600",
                icon: "•",
              };
              const status = STATUS_LABELS[tx.status] ?? {
                label: tx.status,
                color: "text-gray-500",
              };
              const isIncome = [
                "DEPOSIT",
                "SELL_GOLD",
                "TRANSFER_IN",
                "REFERRAL_REWARD",
                "SALARY",
                "REFUND",
              ].includes(tx.type);

              return (
                <div
                  key={tx.id}
                  className="flex items-center gap-3 p-4 rounded-2xl"
                  style={{
                    backgroundColor: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-[18px] shrink-0"
                    style={{ backgroundColor: "var(--color-bg-page)" }}
                  >
                    {info.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-[13px] font-bold ${info.color}`}>
                        {info.label}
                      </p>
                      <span className={`text-[10px] font-bold ${status.color}`}>
                        • {status.label}
                      </span>
                    </div>
                    {tx.description && (
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">
                        {tx.description}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-300 mt-0.5">
                      {new Date(tx.createdAt).toLocaleDateString("fa-IR", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    {tx.amountRial && (
                      <p
                        className={`text-[13px] font-black ${isIncome ? "text-green-600" : "text-red-500"}`}
                      >
                        {isIncome ? "+" : "-"}
                        {tx.amountRial.toLocaleString("fa-IR")}
                        <span className="text-[10px] mr-0.5">ت</span>
                      </p>
                    )}
                    {tx.amountGrams && (
                      <p
                        className={`text-[12px] font-bold ${isIncome ? "text-amber-600" : "text-gray-500"}`}
                      >
                        {isIncome ? "+" : "-"}
                        {tx.amountGrams}
                        <span className="text-[10px] mr-0.5">گرم</span>
                      </p>
                    )}
                    {tx.feeAmount && tx.feeAmount > 0 && (
                      <p className="text-[10px] text-gray-400">
                        کارمزد: {tx.feeAmount.toLocaleString("fa-IR")}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-xl bg-gray-100 text-gray-600 disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-[13px] font-bold text-gray-600">
                {page} از {meta.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                disabled={page === meta.totalPages}
                className="p-2 rounded-xl bg-gray-100 text-gray-600 disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── صفحه اصلی ──
export default function WalletPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const { refetch } = useWallet();

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: "overview", label: "موجودی", icon: Wallet },
    { key: "deposit", label: "واریز", icon: ArrowDownCircle },
    { key: "withdraw", label: "برداشت", icon: ArrowUpCircle },
    { key: "history", label: "تاریخچه", icon: History },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-5" dir="rtl">
      {/* هدر */}
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: "var(--color-emerald-light)" }}
        >
          <Wallet
            className="w-5 h-5"
            style={{ color: "var(--color-emerald)" }}
          />
        </div>
        <div>
          <h1 className="text-[18px] font-black text-gray-900">کیف پول</h1>
          <p className="text-[12px] text-gray-400">مدیریت موجودی و تراکنش‌ها</p>
        </div>
      </div>

      {/* تب‌ها */}
      <div
        className="flex p-1.5 rounded-2xl gap-1"
        style={{ backgroundColor: "var(--color-bg-page)" }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[12px] font-bold transition-all ${
              activeTab === key
                ? "text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
            style={
              activeTab === key
                ? { backgroundColor: "var(--color-emerald)" }
                : {}
            }
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* محتوا */}
      <div>
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "deposit" && <DepositTab />}
        {activeTab === "withdraw" && <WithdrawTab onSuccess={refetch} />}
        {activeTab === "history" && <HistoryTab />}
      </div>
    </div>
  );
}
