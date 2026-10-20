"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Eye, EyeOff, Gift, LogIn } from "lucide-react";
import { useRegister } from "../hooks/useRegister";
import OtpInput from "../components/OtpInput";
import { digitsOnly } from "../utils/digits";
import {
  captureReturnPathFromUrl,
  consumeReturnPath,
} from "../utils/return-path";
import AuthShell, {
  AuthDivider,
  AuthError,
  AuthHeading,
  AuthTerms,
} from "../components/auth/AuthShell";
import {
  authInput,
  authLabel,
  authPrimaryButton,
  authSecondaryButton,
} from "../components/auth/styles";

// کد دعوت دریافتی از لینک دعوت (/register?ref=CODE) — در sessionStorage نگه
// داشته می‌شود تا با رفت‌وبرگشت بین صفحات ورود/ثبت‌نام از دست نرود
const REF_STORAGE_KEY = "arkan.referralCode";
const REF_CODE_PATTERN = /^[A-Z0-9]{8}$/;

const subscribeNoop = () => () => {};
const serverInviteCode = () => "";

function readInviteCode(): string {
  const fromUrl =
    new URLSearchParams(window.location.search)
      .get("ref")
      ?.trim()
      .toUpperCase() ?? "";
  if (REF_CODE_PATTERN.test(fromUrl)) return fromUrl;
  try {
    const stored = sessionStorage.getItem(REF_STORAGE_KEY) ?? "";
    return REF_CODE_PATTERN.test(stored) ? stored : "";
  } catch {
    return "";
  }
}

export default function RegisterPage() {
  const router = useRouter();
  const {
    step,
    setStep,
    loading,
    error,
    setError,
    handleSendOtp,
    handleVerifyOtp,
    handleFinalize,
  } = useRegister();

  const [userType, setUserType] = useState<"REAL" | "LEGAL">("REAL");
  const [formData, setFormData] = useState({
    phone: "",
    repPhone: "",
    companyNationalId: "",
    otp: ["", "", "", "", "", ""],
    password: "",
    confirmPassword: "",
    // null یعنی کاربر فیلد را دستکاری نکرده و کد دعوتِ لینک استفاده می‌شود
    referralCode: null as string | null,
  });

  // کد دعوتی که از لینک دعوت آمده (برای نمایش بنر و پرکردن خودکار فیلد کد معرف)
  const inviteCode = useSyncExternalStore(
    subscribeNoop,
    readInviteCode,
    serverInviteCode,
  );
  const referralCode = formData.referralCode ?? inviteCode;

  // مسیر بازگشت (?next=) — مثلاً صفحه شمشی که کاربر از سایت انتخاب کرده
  useEffect(() => {
    captureReturnPathFromUrl();
  }, []);

  useEffect(() => {
    if (!inviteCode) return;
    try {
      sessionStorage.setItem(REF_STORAGE_KEY, inviteCode);
    } catch {
      // دسترسی به sessionStorage ممکن نیست
    }
  }, [inviteCode]);

  // هندلر هوشمند برای فیلدهای عددی
  const handleNumericChange = (
    key: keyof typeof formData,
    value: string,
    maxLength: number,
  ) => {
    const onlyDigits = digitsOnly(value);
    if (onlyDigits.length <= maxLength) {
      setFormData({ ...formData, [key]: onlyDigits });
      if (error) setError(null);
    }
  };

  const handleSubmit = async () => {
    if (step === 1) {
      const activePhone =
        userType === "REAL" ? formData.phone : formData.repPhone;
      if (!activePhone) {
        setError("لطفا شماره موبایل را وارد کنید.");
        return;
      }
      await handleSendOtp(activePhone);
    } else if (step === 2) {
      const activePhone =
        userType === "REAL" ? formData.phone : formData.repPhone;
      await handleVerifyOtp(
        activePhone,
        formData.otp,
        userType,
        formData.companyNationalId,
      );
    } else if (step === 3) {
      const success = await handleFinalize(
        formData.password,
        formData.confirmPassword,
        referralCode,
      );
      if (success) {
        try {
          sessionStorage.removeItem(REF_STORAGE_KEY);
        } catch {
          // دسترسی به sessionStorage ممکن نیست
        }
        router.replace(consumeReturnPath() ?? "/dashboard");
      }
    }
  };

  const handleOtpChange = (next: string[]) => {
    setFormData((prev) => ({ ...prev, otp: next }));
    if (error) setError(null);
  };

  const handleOtpComplete = async (code: string) => {
    if (loading) return;
    const activePhone = userType === "REAL" ? formData.phone : formData.repPhone;
    await handleVerifyOtp(
      activePhone,
      code.split(""),
      userType,
      formData.companyNationalId,
    );
  };

  return (
    <AuthShell
      tagline="سریع‌ترین و امن‌ترین پلتفرم معاملاتی طلا در کشور."
      footer={
        <div className="auth-stack-sm text-center">
          {step === 1 && (
            <>
              <AuthDivider label="حساب کاربری دارید؟" />
              <Link
                href="/login"
                className={`${authSecondaryButton} border-emerald text-emerald hover:bg-emerald hover:text-white`}
              >
                <LogIn className="h-5 w-5" />
                ورود به حساب کاربری
              </Link>
            </>
          )}
          <AuthTerms />
        </div>
      }
    >
      <form
        className="auth-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading) void handleSubmit();
        }}
      >
        <AuthHeading title="ثبت نام">
          <div className="mt-3 flex gap-2" aria-label={`مرحله ${step} از ۳`}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${step >= s ? "bg-emerald" : "bg-gray-200"}`}
              />
            ))}
          </div>
        </AuthHeading>

        {/* بنر ورود از طریق لینک دعوت */}
        {inviteCode && step !== 2 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 sm:text-sm">
            <Gift className="mt-0.5 h-4 w-4 shrink-0 text-gold-500" />
            <p className="leading-relaxed">
              با دعوت دوستتان وارد شده‌اید؛ کد دعوت{" "}
              <span className="font-mono tracking-widest" dir="ltr">
                {inviteCode}
              </span>{" "}
              خودکار ثبت می‌شود.
            </p>
          </div>
        )}

        <AuthError message={error} />

        {/* مرحله ۱ */}
        {step === 1 && (
          <div className="auth-stack animate-in fade-in duration-300">
            <div className="flex rounded-2xl border border-gray-200 bg-gray-100 p-1">
              {(
                [
                  ["REAL", "حقیقی"],
                  ["LEGAL", "حقوقی"],
                ] as const
              ).map(([type, label]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setUserType(type)}
                  className={`flex-1 rounded-xl py-2.5 font-bold transition-all ${userType === type ? "bg-white text-emerald shadow-sm" : "text-gray-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {userType === "REAL" ? (
              <InputField
                label="شماره موبایل"
                placeholder="09123456789"
                value={formData.phone}
                onChange={(v) => handleNumericChange("phone", v, 11)}
                isNumeric
              />
            ) : (
              <>
                <InputField
                  label="شماره موبایل نماینده"
                  placeholder="0912..."
                  value={formData.repPhone}
                  onChange={(v) => handleNumericChange("repPhone", v, 11)}
                  isNumeric
                />
                <InputField
                  label="شناسه ملی شرکت"
                  placeholder="1032..."
                  value={formData.companyNationalId}
                  onChange={(v) => handleNumericChange("companyNationalId", v, 11)}
                  isNumeric
                />
              </>
            )}
          </div>
        )}

        {/* مرحله ۲ */}
        {step === 2 && (
          <div className="auth-stack animate-in fade-in duration-300">
            <p className="text-center text-sm font-medium leading-relaxed text-gray-500">
              کد تایید به شماره{" "}
              <span className="font-bold text-emerald" dir="ltr">
                {userType === "REAL" ? formData.phone : formData.repPhone}
              </span>{" "}
              ارسال شد.
              <br />
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mt-1 text-xs font-bold text-gold-500 underline transition-colors hover:text-[#a88646]"
              >
                ویرایش شماره
              </button>
            </p>
            <OtpInput
              value={formData.otp}
              onChange={handleOtpChange}
              onComplete={handleOtpComplete}
              disabled={loading}
            />
          </div>
        )}

        {/* مرحله ۳ */}
        {step === 3 && (
          <div className="auth-stack-sm animate-in fade-in duration-300">
            <InputField
              label="رمز عبور"
              placeholder="حداقل ۸ کاراکتر"
              value={formData.password}
              onChange={(v) => {
                setFormData({ ...formData, password: v });
                if (error) setError(null);
              }}
              isPassword
            />
            <InputField
              label="تکرار رمز عبور"
              placeholder="تکرار دقیق رمز عبور"
              value={formData.confirmPassword}
              onChange={(v) => {
                setFormData({ ...formData, confirmPassword: v });
                if (error) setError(null);
              }}
              isPassword
            />
            <p className="auth-hint mr-1 text-[11px] leading-5 text-gray-400">
              حداقل ۸ و حداکثر ۱۲۸ کاراکتر؛ نیازی به عدد یا نماد نیست. یک عبارت طولانی و به‌یادماندنی
              (حتی فارسی) بهترین انتخاب است. رمزهای رایج یا افشاشده و رمزهای ساخته‌شده از نام برنامه یا
              شماره موبایل پذیرفته نمی‌شوند. استفاده از مدیر رمز عبور مرورگر هم مجاز است.
            </p>
            <InputField
              label="کد معرف (اختیاری)"
              placeholder="مثال: X7Y2Z9AB"
              value={referralCode}
              onChange={(v) =>
                setFormData({
                  ...formData,
                  referralCode: v.replace(/\s/g, "").toUpperCase().slice(0, 8),
                })
              }
            />
          </div>
        )}

        {/* دکمه اصلی */}
        <button type="submit" disabled={loading} className={authPrimaryButton}>
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              {step === 3 ? "تکمیل ثبت نام" : "ادامه"}
              <ArrowLeft className="h-5 w-5" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}

// کامپوننت اینپوت با قابلیت نمایش/مخفی‌سازی رمز عبور
interface InputFieldProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  isNumeric?: boolean;
  isPassword?: boolean;
}

function InputField({
  label,
  placeholder,
  value,
  onChange,
  isNumeric = false,
  isPassword = false,
}: InputFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordField = isPassword && !showPassword;

  return (
    <div>
      <label className={authLabel}>{label}</label>
      <div className="relative flex items-center">
        <input
          type={isPasswordField ? "password" : isNumeric ? "tel" : "text"}
          inputMode={isNumeric ? "numeric" : undefined}
          autoComplete={isPassword ? "new-password" : isNumeric ? "off" : undefined}
          maxLength={isPassword ? 128 : undefined}
          placeholder={placeholder}
          aria-label={label}
          dir={isNumeric || isPassword ? "ltr" : "rtl"}
          className={`${authInput} px-4 ${isNumeric || isPassword ? "text-left" : "text-right"} ${isPassword ? "pl-12" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
            className="absolute left-4 text-gray-400 transition-colors hover:text-emerald focus:outline-none"
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}
