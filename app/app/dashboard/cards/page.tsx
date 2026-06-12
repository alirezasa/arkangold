"use client";

import { useState } from "react";
import {
  CreditCard,
  Plus,
  Star,
  StarOff,
  ShieldCheck,
  Clock,
  AlertCircle,
  Loader2,
  X,
  CheckCircle2,
  Building2,
} from "lucide-react";
import {
  useBankAccounts,
  useAddBankAccount,
} from "@/app/hooks/useBankAccounts";
//import { BankInquiryService } from "@/app/utils/bankUtils";

// ── کامپوننت کارت بانکی ──
function BankCard({
  account,
  onSetDefault,
}: {
  account: {
    id: string;
    bankName: string;
    cardNumber: string;
    cardLast4: string;
    sheba: string | null;
    isVerified: boolean;
    isDefault: boolean;
  };
   onSetDefault: (id: string) => Promise<boolean>;
}) {
  const [settingDefault, setSettingDefault] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSetDefault = async () => {
    setSettingDefault(true);
    setErr(null);
    try {
      const success = await onSetDefault(account.id);
      if (!success) {
        // اگر عملیات false برگرداند، خطا نشان می‌دهیم
        setErr("تنظیم پیش‌فرض ناموفق بود. لطفاً دوباره تلاش کنید.");
      }
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "خطا");
    } finally {
      setSettingDefault(false);
    }
  };

  return (
    <div
      className={`relative rounded-2xl p-5 transition-all ${
        account.isDefault ? "ring-2 ring-gold-500" : "border border-gray-100"
      }`}
      style={{ backgroundColor: "var(--color-surface)" }}
    >
      {/* نوار رنگی بالا */}
      <div
        className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
        style={{
          background: account.isDefault
            ? "linear-gradient(90deg, #c5a059, #e8c97a)"
            : account.isVerified
              ? "#22c55e"
              : "#94a3b8",
        }}
      />

      <div className="flex items-start justify-between gap-3 mt-1">
        <div className="flex items-center gap-3">
          {/* آیکون بانک */}
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: "var(--color-bg-page)" }}
          >
            <Building2 className="w-5 h-5 text-gray-500" />
          </div>

          <div>
            <p className="text-[14px] font-black text-gray-800">
              {account.bankName}
            </p>
            <p
              className="text-[13px] font-bold text-gray-400 mt-0.5 tracking-widest"
              dir="ltr"
            >
              {account.cardNumber}
            </p>
            {account.sheba && (
              <p className="text-[11px] text-gray-400 mt-0.5" dir="ltr">
                {account.sheba}
              </p>
            )}
          </div>
        </div>

        {/* وضعیت */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {account.isVerified ? (
            <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 border border-green-100 rounded-lg text-[11px] font-bold">
              <ShieldCheck className="w-3.5 h-3.5" /> تایید شده
            </span>
          ) : (
            <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-700 border border-amber-100 rounded-lg text-[11px] font-bold">
              <Clock className="w-3.5 h-3.5 animate-pulse" /> در انتظار
            </span>
          )}

          {account.isDefault && (
            <span
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
              style={{
                backgroundColor: "#fdf6e7",
                color: "#c5a059",
                border: "1px solid #f0d990",
              }}
            >
              <Star className="w-3.5 h-3.5 fill-current" /> پیش‌فرض
            </span>
          )}
        </div>
      </div>

      {/* دکمه پیش‌فرض */}
      {!account.isDefault && account.isVerified && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {err && (
            <p className="text-[11px] text-red-500 font-bold mb-2">{err}</p>
          )}
          <button
            onClick={handleSetDefault}
            disabled={settingDefault}
            className="flex items-center gap-1.5 text-[12px] font-bold text-gray-500 hover:text-gold-500 transition-colors disabled:opacity-50"
          >
            {settingDefault ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <StarOff className="w-4 h-4" />
            )}
            تنظیم به عنوان پیش‌فرض
          </button>
        </div>
      )}

      {/* پیام تایید نشده */}
      {!account.isVerified && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-700 text-[11px] font-medium">
          <Clock className="w-3.5 h-3.5 mt-0.5 shrink-0 animate-pulse" />
          این حساب در انتظار تایید کارشناسان است و فعلاً قابل استفاده نیست.
        </div>
      )}
    </div>
  );
}

// ── فرم افزودن حساب ──
function AddAccountForm({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const { loading, error, setError, submit } = useAddBankAccount();
  const [form, setForm] = useState({
    cardNumber: "",
    sheba: "",
    bankName: "",
    accountNumber: "",
  });
  const [done, setDone] = useState(false);

  // تشخیص خودکار بانک از BIN
  const handleCardChange = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 16);
    const detected =
      digits.length >= 6 ? detectBankFromBin(digits.slice(0, 6)) : "";
    setForm((f) => ({
      ...f,
      cardNumber: digits,
      bankName: detected || f.bankName,
    }));
    if (error) setError(null);
  };

  const handleShebaChange = (val: string) => {
    // اضافه کردن IR اگر نداره
    let v = val.toUpperCase().replace(/[^IR\d]/g, "");
    if (v.length > 0 && !v.startsWith("IR")) v = "IR" + v.replace(/\D/g, "");
    setForm((f) => ({ ...f, sheba: v.slice(0, 26) }));
    if (error) setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.cardNumber.length !== 16)
      return setError("شماره کارت باید ۱۶ رقم باشد");
    if (form.sheba.length < 24) return setError("شماره شبا معتبر نیست");

    const result = await submit({
      cardNumber: form.cardNumber,
      sheba: form.sheba,
      bankName: form.bankName || "بانک نامشخص",
      accountNumber: form.accountNumber || undefined,
    });

    if (result) {
      setDone(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <CheckCircle2 className="w-14 h-14 text-green-500" />
        <h3 className="text-[16px] font-black text-gray-800">حساب ثبت شد</h3>
        <p className="text-[13px] text-gray-500">در انتظار تایید کارشناسان</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl text-[13px] font-bold text-red-600 bg-red-50 border border-red-100">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* شماره کارت */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          شماره کارت (۱۶ رقم)
        </label>
        <input
          type="tel"
          dir="ltr"
          maxLength={16}
          placeholder="6037************"
          value={form.cardNumber}
          onChange={(e) => handleCardChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-[15px] font-bold border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left tracking-widest"
        />
      </div>

      {/* نام بانک (auto-detect) */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">نام بانک</label>
        <input
          type="text"
          placeholder="بانک ملت"
          value={form.bankName}
          onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
          className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all"
        />
        {form.cardNumber.length >= 6 && form.bankName && (
          <p className="text-[11px] text-green-600 font-bold">
            ✓ بانک شناسایی شد: {form.bankName}
          </p>
        )}
      </div>

      {/* شبا */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">شماره شبا</label>
        <input
          type="text"
          dir="ltr"
          maxLength={26}
          placeholder="IR000000000000000000000000"
          value={form.sheba}
          onChange={(e) => handleShebaChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl text-[13px] font-bold border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left tracking-wider"
        />
      </div>

      {/* شماره حساب (اختیاری) */}
      <div className="space-y-1.5">
        <label className="text-[12px] font-bold text-gray-500">
          شماره حساب (اختیاری)
        </label>
        <input
          type="tel"
          dir="ltr"
          placeholder="0000000000"
          value={form.accountNumber}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              accountNumber: e.target.value.replace(/\D/g, ""),
            }))
          }
          className="w-full px-4 py-3 rounded-xl text-[14px] font-medium border border-gray-200 outline-none focus:border-gold-500 bg-white transition-all text-left"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 rounded-xl font-black text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60"
        style={{ backgroundColor: "var(--color-emerald)" }}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <>
            <CreditCard className="w-5 h-5" />
            ثبت حساب بانکی
          </>
        )}
      </button>
    </form>
  );
}

// ── تابع کمکی تشخیص بانک در کلاینت ──
function detectBankFromBin(bin: string): string {
  const banks: Record<string, string> = {
    "603799": "بانک ملی",
    "589210": "بانک سپه",
    "636214": "بانک آینده",
    "627412": "بانک اقتصاد نوین",
    "622106": "بانک پارسیان",
    "639194": "بانک پارسیان",
    "603770": "بانک کشاورزی",
    "639217": "بانک کشاورزی",
    "628023": "بانک مسکن",
    "627353": "بانک تجارت",
    "610433": "بانک ملت",
    "991975": "بانک ملت",
    "603684": "بانک رفاه",
    "621986": "بانک سامان",
    "639346": "بانک سینا",
    "502806": "بانک شهر",
    "603769": "بانک صادرات",
    "610343": "بانک صادرات",
    "627381": "بانک انصار",
    "627488": "بانک کارآفرین",
    "504172": "بانک رسالت",
    "505416": "بانک گردشگری",
  };
  return banks[bin] || "";
}

// ── صفحه اصلی ──
export default function CardsPage() {
  const { accounts, loading, error, refetch, setDefault } = useBankAccounts();
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
      {/* هدر */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: "var(--color-emerald-light)" }}
          >
            <CreditCard
              className="w-5 h-5"
              style={{ color: "var(--color-emerald)" }}
            />
          </div>
          <div>
            <h1 className="text-[18px] font-black text-gray-900">
              حساب‌های بانکی
            </h1>
            <p className="text-[12px] text-gray-400">
              {accounts.length} از ۵ حساب
            </p>
          </div>
        </div>

        {accounts.length < 5 && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-white transition-all"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Plus className="w-4 h-4" />
            افزودن حساب
          </button>
        )}
      </div>

      {/* نوتیس */}
      <div
        className="flex items-start gap-3 p-4 rounded-xl text-[12px] font-medium"
        style={{
          backgroundColor: "#fefce8",
          border: "1px solid #fef08a",
          color: "#854d0e",
        }}
      >
        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
        <p>
          حساب‌های بانکی برای برداشت ریال استفاده می‌شوند. پس از ثبت، توسط
          کارشناسان ما استعلام و تایید می‌شوند.
        </p>
      </div>

      {/* لیست کارت‌ها */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2
            className="w-8 h-8 animate-spin"
            style={{ color: "var(--color-emerald)" }}
          />
        </div>
      ) : error ? (
        <div className="text-center py-12 text-red-500 font-bold text-[14px]">
          {error}
        </div>
      ) : accounts.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center py-16 gap-4 rounded-2xl"
          style={{ border: "2px dashed var(--color-border)" }}
        >
          <CreditCard className="w-12 h-12 text-gray-300" />
          <p className="text-[14px] font-bold text-gray-400">
            هنوز حساب بانکی ثبت نکرده‌اید
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-bold text-white"
            style={{ backgroundColor: "var(--color-emerald)" }}
          >
            <Plus className="w-4 h-4" />
            افزودن اولین حساب
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((acc) => (
           <BankCard key={acc.id} account={acc} onSetDefault={setDefault} />
          ))}
        </div>
      )}

      {/* Modal فرم */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          />
          <div
            className="relative w-full max-w-md rounded-2xl p-6 shadow-xl"
            style={{ backgroundColor: "var(--color-surface)" }}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[16px] font-black text-gray-800">
                افزودن حساب بانکی
              </h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <AddAccountForm
              onSuccess={refetch}
              onClose={() => setShowForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
