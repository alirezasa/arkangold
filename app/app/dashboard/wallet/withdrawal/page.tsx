
"use client";
import { useState } from "react";
import Link from "next/link";
import { useWallet, useWithdrawalConfig, useWithdrawal } from "@/app/hooks/useWallet";
import { useBankAccounts } from "@/app/hooks/useBankAccounts";
import { useGoldPrice } from "@/app/hooks/useGoldPrice";
import {
  ChevronLeft, CheckCircle2, AlertCircle, Loader2,
  CreditCard, Clock, ArrowUpCircle, Info
} from "lucide-react";

function toToman(rial: number) {
  return (rial / 10).toLocaleString("fa-IR");
}

function LimitBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct > 80 ? "#ef4444" : pct > 50 ? "#f59e0b" : "#22c55e";
  return (
    <div>
      <div className="flex justify-between text-[11px] font-bold text-gray-500 mb-1.5">
        <span>{label}</span>
        <span>{toToman(used)} / {toToman(total)} ت</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

type Step = "select-card" | "enter-amount" | "confirm" | "done";

export default function WithdrawalPage() {
  const { wallet, refresh: refreshWallet } = useWallet();
  const { config, refresh: refreshConfig } = useWithdrawalConfig();
  const { accounts } = useBankAccounts();
  const { data: goldPrice } = useGoldPrice();
  const { loading, error, setError, request } = useWithdrawal();

  const [step, setStep] = useState<Step>("select-card");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{
    withdrawalId: string;
    amount: number;
    bankName: string;
    cardNumber: string;
    processingTime: string;
  } | null>(null);

  const verifiedAccounts = accounts.filter((a) => a.isVerified);
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const amountRial = Number(amount.replace(/,/g, "")) * 10;

  // بررسی لحظه‌ای سقف
  const remainingToday = config?.remainingToday ?? 0;
  const remainingMonth = config?.remainingThisMonth ?? 0;
  const availableBalance = wallet?.availableRial ?? 0;
  const maxPossible = Math.min(remainingToday, remainingMonth, availableBalance, config?.maxAmount ?? 0);

  const handleSubmitAmount = () => {
    if (!amountRial || amountRial < (config?.minAmount ?? 100000)) {
      return setError(`حداقل مبلغ برداشت ${toToman(config?.minAmount ?? 100000)} تومان است`);
    }
    if (amountRial > maxPossible) {
      return setError(`حداکثر مبلغ قابل برداشت ${toToman(maxPossible)} تومان است`);
    }
    setError(null);
    setStep("confirm");
  };

  const handleConfirm = async () => {
    const res = await request(selectedAccountId, amountRial);
    if (res) {
      setResult(res);
      setStep("done");
      refreshWallet();
      refreshConfig();
    }
  };

  return (
    <div className="max-w-lg mx-auto pb-24" dir="rtl">

      {/* هدر */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/dashboard/wallet"
          className="w-9 h-9 rounded-xl flex items-center justify-center border border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
        >
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </Link>
        <div>
          <h1 className="text-[17px] font-black text-gray-900">برداشت</h1>
          <p className="text-[11px] text-gray-400">انتقال به حساب بانکی</p>
        </div>
        {goldPrice && (
          <div
            className="mr-auto px-3 py-1.5 rounded-xl text-[11px] font-bold"
            style={{ background: "rgba(197,160,89,.1)", color: "#92400e" }}
          >
            🪙 {(goldPrice.price * 1000).toLocaleString("fa-IR")} ت
          </div>
        )}
      </div>

      {/* ── موجودی قابل برداشت ── */}
      {wallet && (
        <div
          className="rounded-2xl p-4 mb-4 flex items-center justify-between"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <div>
            <p className="text-[11px] text-gray-400 mb-0.5">موجودی کیف پول</p>
            <p className="text-[20px] font-black text-gray-800">
              {toToman(wallet.rialBalance)}
              <span className="text-[12px] font-bold text-gray-400 mr-1">تومان</span>
            </p>
          </div>
          <div className="text-left">
            <p className="text-[11px] text-gray-400 mb-0.5">قابل برداشت</p>
            <p className="text-[16px] font-black text-green-600">
              {toToman(wallet.availableRial)}
              <span className="text-[11px] font-bold text-gray-400 mr-1">تومان</span>
            </p>
          </div>
        </div>
      )}

      {/* ── سقف‌های برداشت ── */}
      {config && (
        <div
          className="rounded-2xl p-4 mb-4 space-y-3"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <p className="text-[12px] font-black text-gray-700 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            محدودیت‌های برداشت
          </p>
          <LimitBar
            used={config.usedToday}
            total={config.dailyLimit}
            label="برداشت روزانه"
          />
          <LimitBar
            used={config.usedThisMonth}
            total={config.monthlyLimit}
            label="برداشت ماهانه"
          />
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2 text-red-600 text-[13px] font-bold">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
        </div>
      )}

      {/* ══ مرحله ۱: انتخاب حساب ══ */}
      {step === "select-card" && (
        <div
          className="rounded-2xl p-5 space-y-4"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <h2 className="text-[14px] font-black text-gray-800">کارت‌های من</h2>

          {verifiedAccounts.length === 0 ? (
            <div className="text-center py-6">
              <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-[13px] text-gray-400 font-medium">حساب بانکی تایید شده‌ای ندارید</p>
              <Link
                href="/dashboard/cards"
                className="inline-block mt-3 px-4 py-2 rounded-xl text-[12px] font-bold text-white"
                style={{ backgroundColor: "var(--color-emerald)" }}
              >
                افزودن حساب بانکی
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {verifiedAccounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => { setSelectedAccountId(acc.id); setError(null); }}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-right ${
                    selectedAccountId === acc.id
                      ? "border-emerald-500 bg-emerald-50"
                      : "border-gray-100 bg-gray-50 hover:border-gray-200"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      selectedAccountId === acc.id ? "bg-emerald-100" : "bg-white"
                    }`}
                  >
                    <CreditCard
                      className={`w-4 h-4 ${selectedAccountId === acc.id ? "text-emerald-600" : "text-gray-400"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-black text-gray-800">{acc.bankName}</p>
                    <p className="text-[12px] text-gray-400 font-medium" dir="ltr">{acc.cardNumber}</p>
                  </div>
                  {acc.isDefault && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      پیش‌فرض
                    </span>
                  )}
                  {selectedAccountId === acc.id && (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => {
              if (!selectedAccountId) return setError("یک حساب بانکی انتخاب کنید");
              setError(null);
              setStep("enter-amount");
            }}
            disabled={!selectedAccountId}
            className="w-full py-3.5 rounded-xl font-black text-white text-[14px] disabled:opacity-40"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            ادامه
          </button>
        </div>
      )}

      {/* ══ مرحله ۲: ورود مبلغ ══ */}
      {step === "enter-amount" && (
        <div
          className="rounded-2xl p-5 space-y-5"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <div>
            <h2 className="text-[14px] font-black text-gray-800 mb-1">
              مبلغ برداشت (تومان)
            </h2>
            <p className="text-[12px] text-gray-400">
              {toToman(config?.minAmount ?? 0)} ~ {toToman(config?.maxAmount ?? 0)} تومان
            </p>
          </div>

          {/* ورودی مبلغ */}
          <div className="relative">
            <input
              type="text"
              inputMode="numeric"
              dir="ltr"
              placeholder={`${toToman(config?.minAmount ?? 0)} ~ ${toToman(config?.maxAmount ?? 0)}`}
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                setAmount(Number(raw).toLocaleString("fa-IR"));
                setError(null);
              }}
              className="w-full px-4 py-4 rounded-xl border-2 border-gray-200 focus:border-emerald-500 outline-none text-left text-[20px] font-black text-gray-800 bg-gray-50 transition-all"
            />
            <button
              onClick={() => {
                setAmount(toToman(availableBalance));
                setError(null);
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[11px] font-bold px-2 py-1 rounded-lg"
              style={{ backgroundColor: "var(--color-emerald-light)", color: "var(--color-emerald)" }}
            >
              کل موجودی
            </button>
          </div>

          {/* مبالغ پیشنهادی */}
          <div className="grid grid-cols-4 gap-2">
            {[10_000_000, 50_000_000, 100_000_000, 200_000_000].map((v) => (
              <button
                key={v}
                onClick={() => { setAmount(v.toLocaleString("fa-IR")); setError(null); }}
                className="py-2 rounded-xl text-[11px] font-bold border border-gray-200 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 transition-all"
              >
                {v >= 1_000_000_000
                  ? `${v / 1_000_000_000}م`
                  : `${v / 1_000_000}م`}
              </button>
            ))}
          </div>

          {/* حساب مقصد */}
          {selectedAccount && (
            <div
              className="flex items-center gap-3 p-3 rounded-xl"
              style={{ backgroundColor: "var(--color-bg-page)" }}
            >
              <CreditCard className="w-4 h-4 text-gray-400 shrink-0" />
              <div>
                <p className="text-[12px] font-black text-gray-700">{selectedAccount.bankName}</p>
                <p className="text-[11px] text-gray-400" dir="ltr">{selectedAccount.cardNumber}</p>
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep("select-card")}
              className="flex-1 py-3.5 rounded-xl font-bold text-[14px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              بازگشت
            </button>
            <button
              onClick={handleSubmitAmount}
              disabled={!amount}
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] disabled:opacity-40"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              ادامه
            </button>
          </div>
        </div>
      )}

      {/* ══ مرحله ۳: تایید نهایی ══ */}
      {step === "confirm" && (
        <div className="space-y-4">
          <div
            className="rounded-2xl p-5 space-y-4"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
          >
            <h2 className="text-[14px] font-black text-gray-800">تایید برداشت</h2>

            {[
              { label: "مبلغ برداشت", value: `${toToman(amountRial)} تومان`, big: true },
              { label: "حساب مقصد", value: selectedAccount?.bankName ?? "" },
              { label: "شماره کارت", value: selectedAccount?.cardNumber ?? "", ltr: true },
              { label: "زمان پردازش", value: config?.processingTime ?? "" },
            ].map((row, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0"
              >
                <span className="text-[12px] text-gray-500 font-medium">{row.label}</span>
                <span
                  className={`font-black ${row.big ? "text-[18px] text-gray-900" : "text-[13px] text-gray-700"}`}
                  dir={row.ltr ? "ltr" : undefined}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* هشدار پایا */}
          <div
            className="flex items-start gap-3 p-4 rounded-xl text-[12px]"
            style={{ backgroundColor: "#fefce8", border: "1px solid #fef08a", color: "#713f12" }}
          >
            <Clock className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              درخواست‌های برداشت طبق چرخه پایا تسویه خواهند شد. در روزهای تعطیل،
              پایا تنها یک بار (بین ۱۲:۴۵ الی ۱۳:۴۵) پردازش انجام می‌دهد.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("enter-amount")}
              className="flex-1 py-3.5 rounded-xl font-bold text-[14px] border-2 border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              بازگشت
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading}
              className="flex-2 py-3.5 rounded-xl font-black text-white text-[14px] flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              {loading
                ? <Loader2 className="w-5 h-5 animate-spin" />
                : <><ArrowUpCircle className="w-4 h-4" />برداشت</>
              }
            </button>
          </div>
        </div>
      )}

      {/* ══ مرحله ۴: انجام شد ══ */}
      {step === "done" && result && (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-[18px] font-black text-gray-900 mb-2">درخواست ثبت شد</h2>
          <p className="text-[13px] text-gray-500 leading-relaxed mb-2">
            مبلغ <span className="font-black text-gray-800">{toToman(result.amount)} تومان</span>
          </p>
          <p className="text-[12px] text-gray-400 mb-6">{result.processingTime}</p>

          <div className="flex flex-col gap-3">
            <Link
              href="/dashboard/wallet"
              className="py-3.5 rounded-xl font-black text-white text-[14px]"
              style={{ backgroundColor: "var(--color-emerald)" }}
            >
              بازگشت به کیف پول
            </Link>
            <Link
              href="/dashboard/transactions"
              className="py-3.5 rounded-xl font-bold text-[13px] border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              مشاهده تراکنش‌ها
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
