"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Phone,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
  UserPlus,
  Loader2,
  Timer,
  Smartphone,
  KeyRound,
  MessageSquareText,
} from "lucide-react";
import { useLogin } from "../hooks/useLogin";
import OtpInput from "../components/OtpInput";
import { digitsOnly } from "../utils/digits";
import { captureReturnPathFromUrl } from "../utils/return-path";
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

export default function LoginPage() {
  const {
    loading,
    checking,
    error,
    setError,
    step,
    challenge,
    submitCredentials,
    requestOtp,
    verifyCode,
    resend,
    restart,
  } = useLogin();

  // روش ورود: رمز عبور (+ برنامه‌ی احراز هویت/کد پیامکی مرحله‌ی دوم) یا فقط کد پیامکی
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [showPassword, setShowPassword] = useState(false);
  const [timer, setTimer] = useState(0);
  // کاربر دارای برنامه‌ی احراز هویت می‌تواند به‌جای کد ۶ رقمی یکی از کدهای بازیابی را وارد کند
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  // Form States
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);

  // مسیر بازگشت (?next=) — مثلاً صفحه شمشی که کاربر از سایت انتخاب کرده
  useEffect(() => {
    captureReturnPathFromUrl();
  }, []);

  // مدیریت تایمر معکوس کد OTP
  useEffect(() => {
    if (timer > 0) {
      const interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  // فرمت زمان تایمر
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // اعتبارسنجی ورودی شماره موبایل (ارقام کیبورد فارسی هم پذیرفته می‌شوند)
  const handlePhoneChange = (val: string) => {
    const onlyDigits = digitsOnly(val);
    if (onlyDigits.length <= 11) {
      setPhone(onlyDigits);
      if (error) setError(null);
    }
  };

  // مدیریت فیلدهای OTP
  const handleOtpChange = (next: string[]) => {
    setOtp(next);
    if (error) setError(null);
  };

  const handleOtpComplete = async (code: string) => {
    if (!loading) await verifyCode(code);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (step === "credentials") {
      if (!/^09\d{9}$/.test(phone)) {
        setError("شماره موبایل باید ۱۱ رقم باشد و با 09 شروع شود.");
        return;
      }
      if (mode === "otp") {
        const wait = await requestOtp(phone);
        setOtp(["", "", "", "", "", ""]);
        setUseRecovery(false);
        setTimer(wait);
        return;
      }
      if (!password) return setError("لطفاً رمز عبور خود را وارد کنید.");
      const wait = await submitCredentials(phone, password);
      setOtp(["", "", "", "", "", ""]);
      setUseRecovery(false);
      setRecoveryCode("");
      setTimer(wait);
      return;
    }

    if (useRecovery) {
      if (recoveryCode.replace(/[^A-Za-z0-9]/g, "").length < 10)
        return setError("کد بازیابی ۱۰ کاراکتری را کامل وارد کنید.");
      await verifyCode(recoveryCode);
      return;
    }
    const fullCode = otp.join("");
    if (fullCode.length < 6)
      return setError("لطفاً کد ۶ رقمی را کامل وارد کنید.");
    await verifyCode(fullCode);
  };

  const handleResend = async () => {
    setOtp(["", "", "", "", "", ""]);
    setTimer(await resend());
  };

  const resetToPhone = () => {
    restart();
    setOtp(["", "", "", "", "", ""]);
    setTimer(0);
    setPassword("");
  };

  return (
    <AuthShell
      tagline="امنیت سرمایه شما، اولویت ماست. وارد پنل کاربری خود شوید و معاملات را مدیریت کنید."
      footer={
        <div className="auth-stack-sm text-center">
          {step === "credentials" && (
            <>
              <AuthDivider label="هنوز حساب کاربری ندارید؟" />
              <Link
                href="/register"
                className={`${authSecondaryButton} border-gold-500 bg-gold-500/5 text-[#8a6d35] hover:bg-gold-500 hover:text-white`}
              >
                <UserPlus className="h-5 w-5" /> ثبت‌نام در آرکان گلد
              </Link>
            </>
          )}
          <AuthTerms />
        </div>
      }
    >
      <div className="auth-stack">
        <AuthHeading title="ورود به حساب" subtitle="لطفاً اطلاعات خود را وارد کنید" />

        <AuthError message={error} />

        <form onSubmit={handleSubmit} className="auth-stack">
          {step === "credentials" && (
            <div
              role="tablist"
              aria-label="روش ورود"
              className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1"
            >
              {(
                [
                  { id: "password", label: "ورود با رمز عبور", Icon: Lock },
                  { id: "otp", label: "ورود با کد پیامکی", Icon: MessageSquareText },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={mode === id}
                  onClick={() => {
                    setMode(id);
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-black transition-all sm:text-sm ${
                    mode === id
                      ? "bg-white text-emerald shadow-sm"
                      : "text-gray-500 hover:text-emerald"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {step === "credentials" && (
            <div className="animate-in fade-in">
              <label htmlFor="login-phone" className={authLabel}>
                شماره موبایل
              </label>
              <div className="relative flex items-center">
                <Phone className="absolute right-4 h-5 w-5 text-emerald" />
                <input
                  id="login-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  dir="ltr"
                  placeholder="0912..."
                  value={phone}
                  onChange={(e) => handlePhoneChange(e.target.value)}
                  className={`${authInput} pl-4 pr-12 text-left`}
                />
              </div>
              {mode === "otp" && (
                <p className="auth-hint mt-2 text-xs font-medium leading-relaxed text-gray-500">
                  کد ورود یکبارمصرف به شماره‌ی موبایل ثبت‌شده در حساب شما پیامک می‌شود.
                </p>
              )}
            </div>
          )}

          {step === "credentials" && mode === "password" && (
            <div className="animate-in fade-in">
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="login-password" className="mr-1 text-xs font-black text-gray-500">
                  گذرواژه
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-bold text-gold-500 transition-colors hover:text-[#a88646] sm:text-sm"
                >
                  فراموشی رمز عبور
                </Link>
              </div>
              <div className="relative flex items-center">
                <Lock className="absolute right-4 h-5 w-5 text-emerald" />
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  maxLength={128}
                  dir="ltr"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
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
            </div>
          )}

          {step === "second_factor" && challenge && (
            <div className="auth-stack animate-in slide-in-from-left-4">
              <div className="text-center">
                <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald/10">
                  {challenge.method === "TOTP" ? (
                    <Smartphone className="h-6 w-6 text-emerald" />
                  ) : (
                    <ShieldCheck className="h-6 w-6 text-emerald" />
                  )}
                </div>
                <p className="font-black text-emerald">
                  {mode === "otp" ? "کد ورود پیامکی" : "تأیید دومرحله‌ای"}
                </p>
                <p className="mt-1 text-sm font-medium leading-relaxed text-gray-500">
                  {challenge.method === "TOTP" ? (
                    useRecovery ? (
                      "یکی از کدهای بازیابی خود را وارد کنید (هر کد فقط یک‌بار قابل استفاده است)."
                    ) : (
                      "کد ۶ رقمی برنامه‌ی احراز هویت (مثل Google Authenticator) را وارد کنید."
                    )
                  ) : (
                    <>
                      کد تایید به{" "}
                      <span className="font-bold text-emerald" dir="ltr">
                        {challenge.maskedPhone}
                      </span>{" "}
                      پیامک شد.
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={resetToPhone}
                  className="mt-1 text-xs font-bold text-gold-500 underline hover:text-[#a88646]"
                >
                  ورود با حساب دیگر
                </button>
              </div>

              {useRecovery ? (
                <input
                  type="text"
                  dir="ltr"
                  autoComplete="one-time-code"
                  placeholder="XXXXX-XXXXX"
                  value={recoveryCode}
                  onChange={(e) => {
                    setRecoveryCode(e.target.value.toUpperCase());
                    if (error) setError(null);
                  }}
                  className={`${authInput} px-4 text-center font-mono tracking-widest`}
                />
              ) : (
                <OtpInput
                  value={otp}
                  onChange={handleOtpChange}
                  onComplete={handleOtpComplete}
                  disabled={loading}
                />
              )}

              <div className="flex items-center justify-center gap-2 text-sm font-bold text-gray-500">
                {challenge.method === "SMS" ? (
                  timer > 0 ? (
                    <>
                      <Timer className="h-4 w-4" />
                      <span>ارسال مجدد کد تا {formatTime(timer)} دیگر</span>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleResend}
                      className="flex items-center gap-1 text-emerald hover:underline"
                    >
                      ارسال مجدد کد
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setUseRecovery(!useRecovery);
                      setError(null);
                    }}
                    className="flex items-center gap-1 text-emerald hover:underline"
                  >
                    <KeyRound className="h-4 w-4" />
                    {useRecovery
                      ? "استفاده از کد برنامه‌ی احراز هویت"
                      : "به برنامه دسترسی ندارم؛ کد بازیابی دارم"}
                  </button>
                )}
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className={authPrimaryButton}>
            {loading ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin" />
                {checking && <span className="text-sm font-bold">در حال بررسی امنیتی…</span>}
              </>
            ) : (
              <>
                {step !== "credentials"
                  ? "تایید و ورود"
                  : mode === "otp"
                    ? "دریافت کد ورود"
                    : "ادامه"}
                <ArrowLeft className="h-5 w-5" />
              </>
            )}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
