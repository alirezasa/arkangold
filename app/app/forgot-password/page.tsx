"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Timer,
  CheckCircle2,
} from "lucide-react";
import { useForgotPassword } from "../hooks/useForgotPassword";
import OtpInput from "../components/OtpInput";
import { digitsOnly } from "../utils/digits";
import AuthShell, { AuthError, AuthHeading } from "../components/auth/AuthShell";
import { authInput, authLabel, authPrimaryButton } from "../components/auth/styles";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const {
    step,
    setStep,
    loading,
    error,
    setError,
    requestOtp,
    verifyOtp,
    submitNewPassword,
    verifyMfa,
  } = useForgotPassword();
  const [mfaCode, setMfaCode] = useState("");

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);
  const [successMsg, setSuccessMsg] = useState(false);

  // تایمر ارسال مجدد کد
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handlePhoneChange = (val: string) => {
    const onlyDigits = digitsOnly(val);
    if (onlyDigits.length <= 11) setPhone(onlyDigits);
    if (error) setError(null);
  };

  const handleOtpChange = (next: string[]) => {
    setOtp(next);
    if (error) setError(null);
  };

  // ارسال خودکار بعد از تایپ رقم آخر
  const handleOtpComplete = (code: string) => {
    if (!loading) verifyOtp(phone, code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "request_phone") {
      if (!/^09\d{9}$/.test(phone))
        return setError("شماره موبایل نامعتبر است.");
      setTimer(await requestOtp(phone));
    } else if (step === "verify_otp") {
      const code = otp.join("");
      if (code.length < 6) return setError("کد تایید کامل نیست.");
      await verifyOtp(phone, code);
    } else if (step === "verify_mfa") {
      if (mfaCode.replace(/\s/g, "").length < 6)
        return setError("کد برنامه‌ی احراز هویت یا کد بازیابی را وارد کنید.");
      await verifyMfa(mfaCode);
    } else if (step === "set_password") {
      if ([...password].length < 8)
        return setError("رمز عبور باید حداقل ۸ کاراکتر باشد.");
      const success = await submitNewPassword(password);
      if (success) {
        setSuccessMsg(true);
        setTimeout(() => router.replace("/login"), 3000);
      }
    }
  };

  return (
    <AuthShell
      tagline="در صورت فراموشی رمز عبور، با تایید هویت خود می‌توانید مجدداً به پنل معاملات دسترسی پیدا کنید."
      footer={
        !successMsg && (
          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 py-2 text-sm font-bold text-gray-500 transition-colors hover:text-emerald"
            >
              <ArrowRight className="h-4 w-4" />
              بازگشت به صفحه ورود
            </Link>
          </div>
        )
      }
    >
      {successMsg ? (
        <div className="text-center animate-in zoom-in duration-300">
          <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-green-500" />
          <h2 className="auth-title mb-2 font-black text-emerald">رمز عبور تغییر یافت!</h2>
          <p className="font-medium text-gray-500">در حال انتقال به صفحه ورود...</p>
        </div>
      ) : (
        <div className="auth-stack">
          <AuthHeading title="فراموشی رمز" subtitle="مراحل بازیابی را طی کنید" />

          <AuthError message={error} />

          <form onSubmit={handleSubmit} className="auth-stack">
            {/* مرحله ۱: شماره موبایل */}
            {step === "request_phone" && (
              <div className="animate-in fade-in">
                <label htmlFor="forgot-phone" className={authLabel}>
                  شماره موبایل متصل به حساب
                </label>
                <div className="relative flex items-center">
                  <Phone className="absolute right-4 h-5 w-5 text-emerald" />
                  <input
                    id="forgot-phone"
                    type="tel"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="0912..."
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    className={`${authInput} pl-4 pr-12 text-left`}
                  />
                </div>
              </div>
            )}

            {/* مرحله ۲: کد تایید */}
            {step === "verify_otp" && (
              <div className="auth-stack animate-in slide-in-from-left-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-500">
                    کد تایید به{" "}
                    <span className="font-bold text-emerald" dir="ltr">
                      {phone}
                    </span>{" "}
                    ارسال شد.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setStep("request_phone");
                      setOtp(["", "", "", "", "", ""]);
                    }}
                    className="mt-1 text-xs font-bold text-gold-500 underline"
                  >
                    ویرایش شماره موبایل
                  </button>
                </div>

                <OtpInput
                  value={otp}
                  onChange={handleOtpChange}
                  onComplete={handleOtpComplete}
                  disabled={loading}
                />

                <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500">
                  {timer > 0 ? (
                    <>
                      <Timer className="h-4 w-4" />
                      <span>ارسال مجدد کد تا {formatTime(timer)}</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => setTimer(await requestOtp(phone))}
                      className="text-emerald hover:underline"
                    >
                      ارسال مجدد کد
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* مرحله ۲-ب: عامل دوم (اگر برنامه‌ی احراز هویت فعال است) — FIA_UID_EXT.1.3 */}
            {step === "verify_mfa" && (
              <div className="auth-stack-sm animate-in slide-in-from-left-4">
                <p className="text-center text-sm font-medium leading-relaxed text-gray-500">
                  ورود دومرحله‌ای حساب شما فعال است. برای ادامه، کد ۶ رقمی برنامه‌ی احراز هویت یا
                  یکی از کدهای بازیابی را وارد کنید.
                </p>
                <input
                  type="text"
                  dir="ltr"
                  autoComplete="one-time-code"
                  placeholder="123456 یا XXXXX-XXXXX"
                  aria-label="کد برنامه‌ی احراز هویت یا کد بازیابی"
                  value={mfaCode}
                  onChange={(e) => {
                    setMfaCode(e.target.value);
                    if (error) setError(null);
                  }}
                  className={`${authInput} px-4 text-center font-mono tracking-widest`}
                />
              </div>
            )}

            {/* مرحله ۳: تنظیم رمز جدید */}
            {step === "set_password" && (
              <div className="animate-in slide-in-from-left-4">
                <label htmlFor="forgot-password" className={authLabel}>
                  رمز عبور جدید
                </label>
                <div className="relative flex items-center">
                  <Lock className="absolute right-4 h-5 w-5 text-emerald" />
                  <input
                    id="forgot-password"
                    type={showPassword ? "text" : "password"}
                    dir="ltr"
                    placeholder="حداقل ۸ کاراکتر"
                    autoComplete="new-password"
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${authInput} pl-12 pr-12 text-left`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                    className="absolute left-4 text-gray-400 transition-colors hover:text-emerald focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="auth-hint mr-1 mt-2 text-[11px] leading-5 text-gray-400">
                  حداقل ۸ و حداکثر ۱۲۸ کاراکتر. عبارت عبور طولانی (حتی فارسی و بدون عدد یا نماد) امن‌تر
                  است؛ رمزهای رایج یا افشاشده و رمزهای ساخته‌شده از نام برنامه یا شماره موبایل پذیرفته نمی‌شوند.
                </p>
              </div>
            )}

            {/* دکمه اصلی فرم */}
            <button type="submit" disabled={loading} className={authPrimaryButton}>
              {loading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  {step === "request_phone"
                    ? "دریافت کد تایید"
                    : step === "verify_otp" || step === "verify_mfa"
                      ? "بررسی کد"
                      : "ثبت رمز جدید"}
                  <ArrowLeft className="h-5 w-5" />
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </AuthShell>
  );
}
